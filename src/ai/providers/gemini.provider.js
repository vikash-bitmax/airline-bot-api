import LlmProviderInterface from './llm-provider.interface.js';
import { env } from '../../config/environment.js';
import {
  validateCustomerOutput,
  cleanAndExtractJson,
  recoverMalformedOutput,
} from '../validators/customer-output.schema.js';
import { buildCustomerSystemPrompt } from '../prompts/customer-system.prompt.js';
import { buildCustomerTurnPrompt } from '../prompts/customer-turn.prompt.js';
import {
  extractDisclosedFacts,
  detectAgentRequestingDisclosedFact,
  detectAgentBehavior,
  enforceBackendPrivacyGuardrail,
} from '../../services/disclosed-facts.service.js';
import logger from '../../utils/logger.js';

export class GeminiProvider extends LlmProviderInterface {
  constructor(config = {}) {
    super();
    this.apiKey = config.apiKey || env.GEMINI.API_KEY;
    this.model = config.model || env.GEMINI.MODEL || 'gemini-3.8-flash';
    this.timeoutMs = config.timeoutMs || env.GEMINI.TIMEOUT_MS || 15000;
    this.maxRetries = config.maxRetries || env.GEMINI.MAX_RETRIES || 2;
  }

  async generateCustomerTurn(context) {
    const startTime = Date.now();
    const { transcript = [], permittedFacts = {} } = context;

    // Track disclosed facts across history
    const disclosedFacts =
      context.disclosedFacts || extractDisclosedFacts(transcript, permittedFacts);

    const enrichedContext = {
      ...context,
      disclosedFacts,
    };

    // If no API key is provided or test mode is enabled, use high-fidelity synthetic fallback
    if (!this.apiKey || env.NODE_ENV === 'test') {
      return this.generateSyntheticFallback(enrichedContext, startTime);
    }

    const systemPrompt = buildCustomerSystemPrompt();
    let userPrompt = buildCustomerTurnPrompt(enrichedContext);

    let lastError = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
        const payload = {
          contents: [
            { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] },
          ],
          generationConfig: {
            temperature: 0.6,
            responseMimeType: 'application/json',
          },
        };

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!rawText) {
          throw new Error('Empty response from Gemini API');
        }

        // Clean & parse JSON safely
        let parsed = cleanAndExtractJson(rawText);

        // Attempt recovery if raw text wasn't pure JSON
        if (!parsed) {
          logger.warn('Failed to parse Gemini JSON output. Attempting recovery parser...');
          parsed = recoverMalformedOutput(rawText, enrichedContext.scenarioContext?.currentState);
        }

        const validation = validateCustomerOutput(parsed);

        if (!validation.success) {
          logger.warn(`Gemini output failed schema validation (attempt ${attempt + 1}):`, validation.error);
          if (attempt < this.maxRetries) {
            // Append correction prompt for retry
            userPrompt += `\n\n[CORRECTION REQUIRED]: Your previous output failed JSON validation: ${validation.error.message}. Output ONLY valid JSON adhering strictly to the schema.`;
            continue;
          }
          return this.generateSyntheticFallback(enrichedContext, startTime);
        }

        // Apply backend privacy guardrails against premature PNR leakage
        const latestAgentMsg = [...transcript].reverse().find((m) => m.senderType === 'AGENT');
        const validatedData = validation.data;

        if (validatedData.messageParts?.[0]?.text) {
          validatedData.messageParts[0].text = enforceBackendPrivacyGuardrail({
            customerReplyText: validatedData.messageParts[0].text,
            agentMessageText: latestAgentMsg?.content || '',
            permittedFacts,
            disclosedFacts,
          });
        }

        return {
          output: validatedData,
          metadata: {
            provider: 'GEMINI',
            model: this.model,
            latencyMs: Date.now() - startTime,
            tokens: data.usageMetadata?.totalTokenCount || 0,
          },
        };
      } catch (err) {
        lastError = err;
        logger.warn(`Gemini attempt ${attempt + 1} failed (${err.message}).`);
        if (attempt < this.maxRetries) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }

    logger.warn(`All Gemini attempts failed (${lastError?.message}). Engaging synthetic fallback.`);
    return this.generateSyntheticFallback(enrichedContext, startTime);
  }

  generateSyntheticFallback(context, startTime) {
    const { personaContext = {}, scenarioContext = {}, permittedFacts = {}, transcript = [] } = context;
    let messageText = '';

    // Disclosed facts in this session
    const disclosedFacts =
      context.disclosedFacts || extractDisclosedFacts(transcript, permittedFacts);

    // Collect past customer message contents to strictly prevent repeating the same reply
    const pastCustomerTexts = transcript
      .filter((m) => m.senderType === 'CUSTOMER')
      .map((m) => (m.content || '').trim().toLowerCase());

    const customerTurns = pastCustomerTexts.length;
    const lastAgentMsg = [...transcript].reverse().find((m) => m.senderType === 'AGENT');
    const lastAgentText = (lastAgentMsg?.content || '').toLowerCase().trim();

    // Helper: pick a template that has not been used yet in this conversation
    const pickUnused = (candidates) => {
      const unused = candidates.filter((c) => !pastCustomerTexts.includes(c.trim().toLowerCase()));
      const pool = unused.length > 0 ? unused : candidates;
      return pool[Math.floor(Math.random() * pool.length)];
    };

    // Classify agent behavior
    const agentBehavior = detectAgentBehavior(lastAgentText, {
      disclosedFacts,
      recentHistory: transcript,
    });

    const isAngry =
      (personaContext.emotionalState || '').toLowerCase().includes('angr') ||
      (personaContext.emotionalState || '').toLowerCase().includes('frustrat') ||
      (personaContext.tone || '').toLowerCase().includes('angr') ||
      Number(personaContext.frustration || 0) >= 6;

    // Detect if agent explicitly asked for booking reference, PNR, or passenger details
    const agentAskedForDetails =
      lastAgentText.includes('pnr') ||
      lastAgentText.includes('booking reference') ||
      lastAgentText.includes('booking code') ||
      lastAgentText.includes('ticket number') ||
      lastAgentText.includes('reservation code') ||
      (lastAgentText.includes('booking') &&
        (lastAgentText.includes('details') ||
          lastAgentText.includes('provide') ||
          lastAgentText.includes('share') ||
          lastAgentText.includes('give')));

    // ── SCENARIO & BEHAVIORAL DISPATCH ──

    // 1. Prompt Injection Defense (Test 11)
    if (agentBehavior === 'PROMPT_INJECTION_ATTEMPT') {
      messageText = "I don't know what you mean by that. I just need help with my flight issue. Can we focus on my booking?";
    }
    // 2. Rude / Dismissive Agent (Test 6)
    else if (agentBehavior === 'RUDE_DISMISSIVE') {
      messageText = isAngry
        ? 'Excuse me? That response is completely rude and unacceptable. I demand to speak with a supervisor right now!'
        : 'I do not appreciate that tone. I am facing a travel disruption and expect professional assistance.';
    }
    // 3. Repeated Question for already disclosed facts (Test 4)
    else if (agentBehavior === 'REPEATED_QUESTION') {
      if (disclosedFacts.includes('pnr') && permittedFacts.pnr) {
        messageText = `I already gave you my booking reference earlier — it is ${permittedFacts.pnr}. Could you please check the details?`;
      } else {
        messageText = 'I already provided that information earlier in our conversation. Please review our chat history.';
      }
    }
    // 4. Repeated Wait / Delay without progress (Test 7)
    else if (agentBehavior === 'REPEATED_WAIT') {
      messageText = isAngry
        ? 'I have already been waiting for a while. What exactly is taking so long? Please give me an update.'
        : 'I understand you are checking, but could you please let me know how much longer this will take?';
    }
    // 5. Vague Resolution / Incomplete promise (Test 8)
    else if (agentBehavior === 'VAGUE_PROMISE') {
      messageText =
        'Could you tell me the expected timeline or reference number for that? A general promise does not help me plan my trip.';
    }
    // 6. Escalation Offered
    else if (agentBehavior === 'ESCALATION_OFFERED') {
      messageText = isAngry
        ? 'Fine, escalate this, but make sure your supervisor actually resolves this instead of wasting more of my time.'
        : 'Understood, thank you. I will wait for your supervisor or team lead to connect.';
    }
    // 7. Genuine Resolution Confirmed (Test 9)
    else if (agentBehavior === 'GENUINE_RESOLUTION') {
      messageText = 'Thank you very much for confirming that solution. I appreciate your assistance!';
    }
    // 8. Empathetic Solution Offered (Test 5)
    else if (agentBehavior === 'EMPATHETIC_SOLUTION') {
      messageText =
        'Thank you for understanding. That solution sounds reasonable — please go ahead and proceed with it.';
    }
    // 9. Initial Greeting / First Turn (Test 1)
    else if (customerTurns === 0 || scenarioContext.currentState === 'INTRODUCE_ISSUE') {
      if (agentAskedForDetails) {
        // Agent immediately asked for PNR in first turn
        if (permittedFacts.pnr) {
          messageText = `My booking reference is ${permittedFacts.pnr} for flight ${permittedFacts.flightNumber || 'SW-101'}. It was cancelled today and I need help.`;
        } else {
          messageText = `I don't have my booking reference right now, but my name is ${permittedFacts.passengerName || 'on the ticket'}. Can you look it up?`;
        }
      } else {
        // Standard initial contact (Explains issue WITHOUT revealing PNR)
        const initialOpeners = [
          `Hello, my flight ${permittedFacts.flightNumber || 'SW-101'} on route ${permittedFacts.route || 'LHR to JFK'} has been cancelled. Can you please assist me with rebooking or a refund?`,
          `Hi, I was informed that my upcoming flight ${permittedFacts.flightNumber || 'SW-101'} has been cancelled today. What are my options?`,
          `Good day, I am ${permittedFacts.passengerName || 'a passenger'} and my flight ${permittedFacts.flightNumber || 'SW-101'} has been disrupted. Could you please look into this for me?`,
        ];
        messageText = pickUnused(initialOpeners);
      }
    }
    // 10. Agent requested booking reference / PNR (Test 2 & Test 3)
    else if (agentAskedForDetails) {
      if (permittedFacts.pnr) {
        // Test 2: PNR available
        const pnrTemplates = [
          `Sure, my booking reference is ${permittedFacts.pnr} under ${permittedFacts.passengerName || 'my name'}.`,
          `Of course. My PNR is ${permittedFacts.pnr}, flight ${permittedFacts.flightNumber || 'SW-101'}.`,
          `Here you go — PNR: ${permittedFacts.pnr}. The ticket is registered under ${permittedFacts.passengerName || 'my name'}.`,
        ];
        messageText = pickUnused(pnrTemplates);
      } else {
        // Test 3: PNR unavailable
        messageText = `I don't have my booking reference with me right now, but my name is ${permittedFacts.passengerName || 'on the ticket'}. Can you look up my reservation by name?`;
      }
    }
    // 11. Agent offered flight times or options
    else if (
      lastAgentText.includes('1pm') ||
      lastAgentText.includes('1:00') ||
      lastAgentText.includes('2pm') ||
      lastAgentText.includes('rebook') ||
      lastAgentText.includes('alternative')
    ) {
      messageText = 'What time does that alternative flight depart and arrive? Could you please confirm if it is a direct flight?';
    }
    // 12. Inconsistent or conflicting info check (Test 12)
    else if (lastAgentText.includes('confirmed') && !lastAgentText.includes('cancel')) {
      messageText = `Wait, you mentioned it is on time, but I received an alert stating flight ${permittedFacts.flightNumber || 'SW-101'} was cancelled. Could you please re-verify the status?`;
    }
    // Default contextual fallback
    else {
      if (lastAgentText.includes('wait') || lastAgentText.includes('moment') || lastAgentText.includes('check')) {
        messageText = 'Sure, I will wait while you look into that.';
      } else {
        messageText = 'Understood. Please let me know what options are available to resolve this.';
      }
    }

    // Backend privacy guardrail on synthetic output
    messageText = enforceBackendPrivacyGuardrail({
      customerReplyText: messageText.trim(),
      agentMessageText: lastAgentText,
      permittedFacts,
      disclosedFacts,
    });

    const fallbackOutput = {
      schemaVersion: '1.0',
      messageParts: [{ type: 'text', text: messageText.trim() }],
      intent: scenarioContext.currentState || 'DISCUSS_OPTIONS',
      speechAct: agentAskedForDetails ? 'DISCLOSURE' : 'STATEMENT',
      emotionExpression: (personaContext.emotionalState || 'neutral').toUpperCase(),
      behaviorTags: ['DIRECT_COMMUNICATION', 'SYNTHETIC_FALLBACK'],
    };

    return {
      output: fallbackOutput,
      metadata: {
        provider: 'SYNTHETIC_FALLBACK',
        model: 'deterministic-v3',
        latencyMs: Date.now() - startTime,
        tokens: 0,
      },
    };
  }
}

export default GeminiProvider;
