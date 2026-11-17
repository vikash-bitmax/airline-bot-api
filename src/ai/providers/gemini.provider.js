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
          temperature: 0.3,
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

    // Count how many CUSTOMER messages already exist to vary responses
    const customerTurns = transcript.filter((m) => m.senderType === 'CUSTOMER').length;
    const agentTurns = transcript.filter((m) => m.senderType === 'AGENT').length;
    const lastAgentMsg = [...transcript].reverse().find((m) => m.senderType === 'AGENT');
    const lastAgentText = (lastAgentMsg?.content || '').toLowerCase();

    // ── State-aware contextual templates with variation ──
    if (scenarioContext.currentState === 'INTRODUCE_ISSUE') {
      // First contact — only use this on the very first turn
      if (customerTurns === 0) {
        const templates = [
          `Hello, my flight ${permittedFacts.flightNumber || ''} on route ${permittedFacts.route || ''} has been cancelled. Can you please help me with rebooking or a refund?`,
          `Hi there, I just found out that my flight ${permittedFacts.flightNumber || ''} has been disrupted. I really need assistance with this.`,
          `Good day, I'm ${permittedFacts.passengerName || 'a passenger'} and my upcoming flight ${permittedFacts.flightNumber || ''} seems to have been cancelled. Could you look into this for me?`,
          `Hi, I received a notification that flight ${permittedFacts.flightNumber || ''} has been cancelled. I need help finding an alternative or getting a refund please.`,
        ];
        if (personaContext.tone === 'aggressive' || personaContext.emotionalState === 'angry') {
          messageText = `This is unacceptable! My flight ${permittedFacts.flightNumber || ''} was cancelled without proper notice. I need this sorted out immediately!`;
        } else if (personaContext.tone === 'anxious') {
          messageText = `Um, hi... I'm really worried because my flight ${permittedFacts.flightNumber || ''} seems to be cancelled? I'm not sure what to do. Can you please help me?`;
        } else {
          messageText = templates[Math.floor(Math.random() * templates.length)];
        }
      } else {
        // Follow-up while still in INTRODUCE_ISSUE
        if (
          lastAgentText.includes('detail') || lastAgentText.includes('pnr') ||
          lastAgentText.includes('booking') || lastAgentText.includes('name') ||
          lastAgentText.includes('info') || lastAgentText.includes('can i get')
        ) {
          messageText = `Sure, my name is ${permittedFacts.passengerName || 'Vikash Sharma'}. Booking reference is ${permittedFacts.pnr || 'SW9941'}, flight ${permittedFacts.flightNumber || 'SW-101'}.`;
        } else {
          const followUps = [
            `Yes, my flight is ${permittedFacts.flightNumber || 'SW-101'}. Could you please check what options I have?`,
            'I really need to get this resolved as soon as possible. What alternatives do you have?',
            `Could you please look into my flight on route ${permittedFacts.route || 'this journey'}?`,
          ];
          messageText = followUps[Math.floor(Math.random() * followUps.length)];
        }
      }

    } else if (scenarioContext.currentState === 'PROVIDE_BOOKING_DETAILS') {
      // Agent asked for details — provide them naturally
      if (lastAgentText.includes('pnr') || lastAgentText.includes('booking') || lastAgentText.includes('reference') || lastAgentText.includes('details')) {
        if (permittedFacts.pnr) {
          const templates = [
            `Sure, my PNR is ${permittedFacts.pnr}. The booking is under ${permittedFacts.passengerName || 'my name'}.`,
            `Of course. My booking reference is ${permittedFacts.pnr}, name ${permittedFacts.passengerName || ''}, flight ${permittedFacts.flightNumber || ''}.`,
            `Here you go — PNR: ${permittedFacts.pnr}. It's for flight ${permittedFacts.flightNumber || ''} on ${permittedFacts.travelDate || 'the upcoming date'}.`,
            `My booking reference number is ${permittedFacts.pnr}. The passenger name is ${permittedFacts.passengerName || 'registered on the ticket'}.`,
          ];
          messageText = templates[Math.floor(Math.random() * templates.length)];
        } else {
          messageText = `I'm sorry, I don't have my booking reference handy at the moment. Is there another way you can look it up?`;
        }
      } else {
        // Generic detail-providing response
        messageText = `Let me give you my details. My name is ${permittedFacts.passengerName || 'on the booking'}, flight ${permittedFacts.flightNumber || ''}, PNR ${permittedFacts.pnr || 'I will check'}.`;
      }

    } else if (scenarioContext.currentState === 'DISCUSS_OPTIONS') {
      const templates = [
        'What options do I have? I would prefer to be rebooked on the next available flight if possible.',
        'Could you tell me what alternatives are available? I need to reach my destination as soon as possible.',
        'I would like to know my options. Is there a direct flight available, or would I need a connecting flight?',
        'What are my choices here? I am flexible with timing but would prefer to fly today if possible.',
      ];
      messageText = templates[Math.floor(Math.random() * templates.length)];

    } else if (scenarioContext.currentState === 'WAIT_FOR_CUSTOMER') {
      // Customer confirming their choice
      if (lastAgentText.includes('refund')) {
        messageText = 'Yes, I would like to go ahead with the full refund back to my original payment method, please.';
      } else if (lastAgentText.includes('rebook') || lastAgentText.includes('alternative')) {
        messageText = 'That sounds good. Please go ahead and rebook me on that alternative flight. Thank you.';
      } else {
        const templates = [
          'Yes, that works for me. Please go ahead and process that.',
          'Okay, I agree with that option. Can you confirm once it is done?',
          'That sounds reasonable. Please proceed and let me know when it is confirmed.',
        ];
        messageText = templates[Math.floor(Math.random() * templates.length)];
      }

    } else if (scenarioContext.currentState === 'COMPLETED') {
      messageText = 'Thank you very much for your help. I appreciate the quick resolution. Have a good day!';

    } else {
      // Generic conversational filler based on agent's last message
      if (lastAgentText.includes('anything else') || lastAgentText.includes('help you with')) {
        messageText = 'No, that should be everything. Thank you for your assistance!';
      } else if (lastAgentText.includes('sorry') || lastAgentText.includes('apologize')) {
        messageText = 'I understand, these things happen. I just need to make sure I can still reach my destination.';
      } else {
        messageText = 'Okay, understood. Please let me know what the next steps are.';
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
