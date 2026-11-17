import { z } from 'zod';

export const customerOutputSchema = z.object({
  schemaVersion: z.literal('1.0').default('1.0'),
  messageParts: z.array(
    z.object({
      type: z.enum(['text', 'fact_ref']),
      text: z.string().min(1),
    })
  ).min(1),
  intent: z.string().min(1),
  speechAct: z.string().optional().default('STATEMENT'),
  emotionExpression: z.string().optional().default('NEUTRAL'),
  behaviorTags: z.array(z.string()).default([]),
});

export const validateCustomerOutput = (data) => {
  return customerOutputSchema.safeParse(data);
};

export default {
  customerOutputSchema,
  validateCustomerOutput,
};
