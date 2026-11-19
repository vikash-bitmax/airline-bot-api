import { z } from 'zod';

export const customerOutputSchema = z.object({
  schemaVersion: z.literal('1.0').default('1.0'),
  messageParts: z
    .array(
      z.object({
        type: z.enum(['text', 'fact_ref']).default('text'),
        text: z.string().min(1, 'Message text cannot be empty'),
      })
    )
    .min(1, 'At least one message part is required'),
  intent: z.string().min(1, 'Intent is required'),
  speechAct: z
    .enum([
      'STATEMENT',
      'REQUEST_INFORMATION',
      'COMPLAINT',
      'CONFIRMATION',
      'GREETING',
      'ESCALATION_REQUEST',
      'RESOLUTION_ACCEPTANCE',
      'DISCLOSURE',
    ])
    .catch('STATEMENT'),
  emotionExpression: z
    .enum([
      'CALM',
      'ANXIOUS',
      'FRUSTRATED',
      'ANGRY',
      'HAPPY',
      'NEUTRAL',
      'CONFUSED',
      'SATISFIED',
    ])
    .catch('NEUTRAL'),
  behaviorTags: z.array(z.string()).default(['DIRECT_COMMUNICATION']),
});

/**
 * Strips Markdown code blocks, trailing commas, and extracts raw JSON.
 */
export const cleanAndExtractJson = (rawText) => {
  if (!rawText || typeof rawText !== 'string') return null;

  let cleaned = rawText.trim();

  // Strip markdown code fences if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  // Extract substring from first '{' to last '}'
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  // Remove trailing commas before closing braces/brackets
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
};

/**
 * Validates parsed object against customerOutputSchema.
 */
export const validateCustomerOutput = (data) => {
  return customerOutputSchema.safeParse(data);
};

/**
 * Controlled recovery fallback for malformed or unparseable LLM output.
 * Guarantees that CRM never receives a malformed payload.
 */
export const recoverMalformedOutput = (rawText, defaultIntent = 'CUSTOMER_REPLY') => {
  let fallbackText = '';

  if (typeof rawText === 'string') {
    // Attempt to extract text from quotes or sentences
    const textMatch = rawText.match(/"text"\s*:\s*"([^"]+)"/i);
    if (textMatch && textMatch[1]) {
      fallbackText = textMatch[1].trim();
    } else {
      // Clean non-JSON text
      const stripped = rawText
        .replace(/[{}[\]"']/g, '')
        .replace(/\b(?:schemaVersion|messageParts|type|text|intent|speechAct|emotionExpression|behaviorTags)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (stripped.length >= 5) {
        fallbackText = stripped;
      }
    }
  }

  if (!fallbackText) {
    fallbackText = 'Could you please check my booking and advise what options are available?';
  }

  return {
    schemaVersion: '1.0',
    messageParts: [{ type: 'text', text: fallbackText }],
    intent: defaultIntent,
    speechAct: 'STATEMENT',
    emotionExpression: 'NEUTRAL',
    behaviorTags: ['DIRECT_COMMUNICATION', 'RECOVERED_PAYLOAD'],
  };
};

export default {
  customerOutputSchema,
  cleanAndExtractJson,
  validateCustomerOutput,
  recoverMalformedOutput,
};
