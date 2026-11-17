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
    const { personaContext, scenarioContext, permittedFacts } = context;
    let messageText = '';

    // Deterministic contextual templates
    if (scenarioContext.currentState === 'INTRODUCE_ISSUE') {
      if (personaContext.tone === 'polite') {
        messageText = `Hello, my flight ${permittedFacts.flightNumber || ''} on route ${permittedFacts.route || ''} has an issue. Can you please assist me?`;
      } else if (personaContext.tone === 'aggressive' || personaContext.emotionalState === 'angry') {
        messageText = `My flight ${permittedFacts.flightNumber || ''} has been disrupted! I need this resolved right now!`;
      } else if (personaContext.messageLength === 'single_line') {
        messageText = `Need help with flight ${permittedFacts.flightNumber || 'cancellation'}.`;
      } else {
        messageText = `Hi, I am contacting support regarding ${scenarioContext.customerObjective}.`;
      }
    } else if (scenarioContext.currentState === 'PROVIDE_BOOKING_DETAILS') {
      if (permittedFacts.pnr) {
        messageText = `My booking reference is ${permittedFacts.pnr} under name ${permittedFacts.passengerName || ''}.`;
      } else {
        messageText = `I do not have my booking reference with me right now.`;
      }
    } else if (scenarioContext.currentState === 'DISCUSS_OPTIONS' || scenarioContext.currentState === 'WAIT_FOR_CUSTOMER') {
      messageText = `I would like to proceed with the full refund option, please.`;
    } else {
      messageText = `Thank you for your assistance. Please confirm when this is completed.`;
    }

    const fallbackOutput = {
      schemaVersion: '1.0',
      messageParts: [{ type: 'text', text: messageText.trim() }],
      intent: scenarioContext.currentState,
      speechAct: 'STATEMENT',
      emotionExpression: (personaContext.emotionalState || 'neutral').toUpperCase(),
      behaviorTags: [personaContext.tone.toUpperCase()],
    };

    return {
      output: fallbackOutput,
      metadata: {
        provider: 'SYNTHETIC_FALLBACK',
        model: 'deterministic-v1',
        latencyMs: Date.now() - startTime,
        tokens: 0,
      },
    };
  }
}

export default GeminiProvider;
