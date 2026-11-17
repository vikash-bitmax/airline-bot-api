import LlmProviderInterface from './llm-provider.interface.js';
import { env } from '../../config/environment.js';
import { validateCustomerOutput } from '../validators/customer-output.schema.js';
import { buildCustomerSystemPrompt } from '../prompts/customer-system.prompt.js';
import { buildCustomerTurnPrompt } from '../prompts/customer-turn.prompt.js';
import logger from '../../utils/logger.js';

export class GeminiProvider extends LlmProviderInterface {
  constructor(config = {}) {
    super();
    this.apiKey = config.apiKey || env.GEMINI.API_KEY;
    this.model = config.model || env.GEMINI.MODEL;
    this.timeoutMs = config.timeoutMs || env.GEMINI.TIMEOUT_MS;
  }

  async generateCustomerTurn(context) {
    const startTime = Date.now();
    const systemPrompt = buildCustomerSystemPrompt();
    const userPrompt = buildCustomerTurnPrompt(context);

    // If no API key is provided or test mode is enabled, use high-fidelity synthetic fallback
    if (!this.apiKey || env.NODE_ENV === 'test') {
      return this.generateSyntheticFallback(context, startTime);
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
      const payload = {
        contents: [
          { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] },
        ],
        generationConfig: {
          temperature: 0.7,
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

      const parsed = JSON.parse(rawText);
      const validation = validateCustomerOutput(parsed);

      if (!validation.success) {
        logger.warn('Gemini output failed schema validation, using fallback:', validation.error);
        return this.generateSyntheticFallback(context, startTime);
      }

      return {
        output: validation.data,
        metadata: {
          provider: 'GEMINI',
          model: this.model,
          latencyMs: Date.now() - startTime,
          tokens: data.usageMetadata?.totalTokenCount || 0,
        },
      };
    } catch (err) {
      logger.warn(`Gemini generation failed (${err.message}). Engaging synthetic fallback.`);
      return this.generateSyntheticFallback(context, startTime);
    }
  }

  generateSyntheticFallback(context, startTime) {
    const { personaContext, scenarioContext, permittedFacts, transcript = [] } = context;
    let messageText = '';

    // Collect past customer message contents to strictly prevent repeating the same reply
    const pastCustomerTexts = transcript
      .filter((m) => m.senderType === 'CUSTOMER')
      .map((m) => (m.content || '').trim().toLowerCase());

    const customerTurns = pastCustomerTexts.length;
    const lastAgentMsg = [...transcript].reverse().find((m) => m.senderType === 'AGENT');
    const lastAgentText = (lastAgentMsg?.content || '').toLowerCase();

    // Helper: pick a template that has not been used yet in this conversation
    const pickUnused = (candidates) => {
      const unused = candidates.filter((c) => !pastCustomerTexts.includes(c.trim().toLowerCase()));
      const pool = unused.length > 0 ? unused : candidates;
      return pool[Math.floor(Math.random() * pool.length)];
    };

    // Detect if agent explicitly asked for booking reference, PNR, or passenger details
    const agentAskedForDetails =
      lastAgentText.includes('pnr') ||
      lastAgentText.includes('booking reference') ||
      lastAgentText.includes('booking code') ||
      lastAgentText.includes('ticket number') ||
      lastAgentText.includes('your details') ||
      lastAgentText.includes('booking details') ||
      lastAgentText.includes('share your booking') ||
      lastAgentText.includes('provide your booking') ||
      (lastAgentText.includes('details') && (lastAgentText.includes('give') || lastAgentText.includes('get') || lastAgentText.includes('share') || lastAgentText.includes('provide')));

    // ── State-aware contextual templates with strict anti-repetition ──
    if (scenarioContext.currentState === 'INTRODUCE_ISSUE') {
      if (customerTurns === 0) {
        // First contact
        const templates = [
          `Hello, my flight ${permittedFacts.flightNumber || ''} on route ${permittedFacts.route || ''} has been cancelled. Can you please help me with rebooking or a refund?`,
          `Hi there, I just found out that my flight ${permittedFacts.flightNumber || ''} has been disrupted. I need assistance with this.`,
          `Good day, I'm ${permittedFacts.passengerName || 'a passenger'} and my upcoming flight ${permittedFacts.flightNumber || ''} seems to have been cancelled. Could you look into this for me?`,
        ];
        messageText = pickUnused(templates);
      } else {
        // Follow-up while still in INTRODUCE_ISSUE
        if (agentAskedForDetails) {
          messageText = `Sure, my booking reference is ${permittedFacts.pnr || 'SW9941'} under ${permittedFacts.passengerName || 'Vikash Sharma'}, flight ${permittedFacts.flightNumber || 'SW-101'}.`;
        } else if (lastAgentText.includes('hello') || lastAgentText.includes('hi') || lastAgentText.includes('help') || lastAgentText.includes('assist')) {
          const greetings = [
            'Thanks for replying. Yes, I need assistance sorting out my cancelled flight.',
            'Thank you. Could you please check what alternative options or refunds are available?',
            'Appreciate your response. My flight was cancelled today and I need to find another way to reach my destination.',
          ];
          messageText = pickUnused(greetings);
        } else {
          const followUps = [
            'I really need to get this resolved as soon as possible. What alternatives do you have?',
            `Could you please check what options are available for flight ${permittedFacts.flightNumber || ''}?`,
            'Please let me know how you can assist with this disruption.',
          ];
          messageText = pickUnused(followUps);
        }
      }

    } else if (scenarioContext.currentState === 'PROVIDE_BOOKING_DETAILS') {
      // ONLY provide booking details if the agent actually requested them!
      if (agentAskedForDetails) {
        if (permittedFacts.pnr) {
          const templates = [
            `Sure, my booking reference is ${permittedFacts.pnr} under ${permittedFacts.passengerName || 'my name'}.`,
            `Of course. My PNR is ${permittedFacts.pnr}, flight ${permittedFacts.flightNumber || 'SW-101'}.`,
            `Here you go — PNR: ${permittedFacts.pnr}. The ticket is registered under ${permittedFacts.passengerName || 'my name'}.`,
          ];
          messageText = pickUnused(templates);
        } else {
          messageText = `I don't have my booking reference right here, but my name is ${permittedFacts.passengerName || 'on the ticket'}. Can you look it up by name?`;
        }
      } else if (lastAgentText.includes('hello') || lastAgentText.includes('hi') || lastAgentText.includes('help') || lastAgentText.includes('assist')) {
        // Agent just greeted or asked general "how can I help" — DO NOT volunteer PNR yet!
        const politeReplies = [
          'Hello! As mentioned, my flight was cancelled and I am looking for assistance with rebooking or a refund.',
          'Hi there. I was informed my flight has been cancelled. What options do I have?',
          'Thanks for connecting with me. Could you please check what options are available for my cancelled flight?',
        ];
        messageText = pickUnused(politeReplies);
      } else if (lastAgentText.includes('wait') || lastAgentText.includes('moment') || lastAgentText.includes('check') || lastAgentText.includes('looking')) {
        // Agent is checking system
        const waitReplies = [
          'Sure, take your time.',
          'Understood, thank you. I will wait.',
          'Okay, please let me know what you find.',
        ];
        messageText = pickUnused(waitReplies);
      } else {
        // Generic follow-up without volunteering PNR
        messageText = 'Please let me know what information you need from me to proceed.';
      }

    } else if (scenarioContext.currentState === 'DISCUSS_OPTIONS') {
      if (lastAgentText.includes('wait') || lastAgentText.includes('moment') || lastAgentText.includes('check')) {
        messageText = 'Sure, I will wait while you check that.';
      } else if (lastAgentText.includes('refund') && lastAgentText.includes('rebook')) {
        messageText = 'Could you tell me the timings for the rebooked flight? If it is too late, I would prefer a full refund.';
      } else if (lastAgentText.includes('rebook') || lastAgentText.includes('alternative') || lastAgentText.includes('flight')) {
        messageText = 'What time does that alternative flight depart? Does it have any layovers?';
      } else if (lastAgentText.includes('refund')) {
        messageText = 'How long does the refund take to process back to my card?';
      } else {
        const templates = [
          'What options do I have? I would prefer to be rebooked on the next available flight if possible.',
          'Could you tell me what alternatives are available? I need to reach my destination today.',
          'What are my choices here? I am flexible with timing but would prefer a direct flight.',
        ];
        messageText = pickUnused(templates);
      }

    } else if (scenarioContext.currentState === 'WAIT_FOR_CUSTOMER') {
      if (lastAgentText.includes('refund')) {
        messageText = 'Yes, I would like to proceed with the full refund back to my original payment method, please.';
      } else if (lastAgentText.includes('rebook') || lastAgentText.includes('alternative') || lastAgentText.includes('next flight')) {
        messageText = 'That alternative flight works for me. Please go ahead and confirm my seat on it.';
      } else {
        const confirmations = [
          'Yes, that works for me. Please go ahead and process that.',
          'Okay, I agree with that solution. Can you confirm once it is completed?',
          'That sounds good. Please proceed and let me know when confirmed.',
        ];
        messageText = pickUnused(confirmations);
      }

    } else if (scenarioContext.currentState === 'COMPLETED') {
      messageText = 'Thank you very much for your help! Have a great day.';

    } else {
      if (lastAgentText.includes('anything else') || lastAgentText.includes('further assistance')) {
        messageText = 'No, that should be everything. Thank you!';
      } else if (lastAgentText.includes('sorry') || lastAgentText.includes('apologize')) {
        messageText = 'I understand, disruptions happen. I just need to make sure this gets resolved.';
      } else {
        messageText = 'Understood. Please let me know what the next steps are.';
      }
    }

    const fallbackOutput = {
      schemaVersion: '1.0',
      messageParts: [{ type: 'text', text: messageText.trim() }],
      intent: scenarioContext.currentState,
      speechAct: 'STATEMENT',
      emotionExpression: (personaContext.emotionalState || 'neutral').toUpperCase(),
      behaviorTags: [(personaContext.tone || 'neutral').toUpperCase()],
    };

    return {
      output: fallbackOutput,
      metadata: {
        provider: 'SYNTHETIC_FALLBACK',
        model: 'deterministic-v2',
        latencyMs: Date.now() - startTime,
        tokens: 0,
      },
    };
  }
}

export default GeminiProvider;
