import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCustomerOutput } from '../src/ai/validators/customer-output.schema.js';
import { validateAuthoritativeEvidence } from '../src/services/event-interpreter.service.js';

test('Security - Output Schema Rejection of Malformed / Jailbreak Payloads', () => {
  // Missing required messageParts
  const invalidPayload1 = {
    schemaVersion: '1.0',
    intent: 'UNKNOWN',
  };
  const res1 = validateCustomerOutput(invalidPayload1);
  assert.equal(res1.success, false);

  // Valid structured customer output
  const validPayload = {
    schemaVersion: '1.0',
    messageParts: [{ type: 'text', text: 'My flight has been cancelled.' }],
    intent: 'DISCUSS_REFUND',
    speechAct: 'STATEMENT',
    emotionExpression: 'FRUSTRATED',
    behaviorTags: ['POLITE'],
  };
  const res2 = validateCustomerOutput(validPayload);
  assert.equal(res2.success, true);
});

test('Security - Sensitive CRM Events Require Authoritative Evidence', () => {
  // Sensitive event with natural-language claim only -> REJECT
  const unverified = validateAuthoritativeEvidence({
    eventType: 'REFUND_PROCESSED',
    evidenceType: 'AGENT_MESSAGE',
    evidenceReference: 'Agent claimed refund was processed',
  });
  assert.equal(unverified.valid, false);

  // Sensitive event with authoritative CRM webhook record -> ACCEPT
  const verified = validateAuthoritativeEvidence({
    eventType: 'REFUND_PROCESSED',
    evidenceType: 'CRM_RECORD',
    evidenceReference: 'TXN-982148124',
  });
  assert.equal(verified.valid, true);

  // Non-sensitive conversational event accepts message evidence
  const general = validateAuthoritativeEvidence({
    eventType: 'AGENT_ASKED_FOR_PNR',
    evidenceType: 'AGENT_MESSAGE',
  });
  assert.equal(general.valid, true);
});
