import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QC_PARAMETERS,
  calculateConversationMetrics,
  runDeterministicQcChecks,
} from '../src/services/qc-evaluation.service.js';

test('QC Parameters - Critical Errors deduct 55%', () => {
  assert.equal(QC_PARAMETERS.INCOMPLETE_RESOLUTION.deduction, 55);
  assert.equal(QC_PARAMETERS.INCOMPLETE_RESOLUTION.category, 'CRITICAL');
  assert.equal(QC_PARAMETERS.INCORRECT_INFORMATION.deduction, 55);
  assert.equal(QC_PARAMETERS.INCOMPLETE_TROUBLESHOOTING.deduction, 55);
});

test('QC Parameters - Misleading Information deducts 20%', () => {
  assert.equal(QC_PARAMETERS.MISLEADING_INFORMATION.deduction, 20);
  assert.equal(QC_PARAMETERS.MISLEADING_INFORMATION.category, 'MISLEADING');
});

test('QC Parameters - Process Compliance Errors deduct 10%', () => {
  const complianceKeys = [
    'WRONG_IDENTIFICATION',
    'ALIAS_VIOLATION',
    'ESCALATION_DELAY',
    'IN_PROGRESS',
    'IN_QUEUE',
    'POOR_INTERACTION_HANDLING',
    'CUSTOMER_NAME_ERROR',
  ];
  for (const key of complianceKeys) {
    assert.ok(QC_PARAMETERS[key], `Missing parameter ${key}`);
    assert.equal(QC_PARAMETERS[key].deduction, 10, `${key} deduction should be 10%`);
    assert.equal(QC_PARAMETERS[key].category, 'PROCESS_COMPLIANCE');
  }
});

test('QC Parameters - Communication Quality deducts 5%', () => {
  const commKeys = ['GRAMMATICAL', 'GREETING_ERROR', 'CLOSING_ERROR'];
  for (const key of commKeys) {
    assert.ok(QC_PARAMETERS[key], `Missing parameter ${key}`);
    assert.equal(QC_PARAMETERS[key].deduction, 5, `${key} deduction should be 5%`);
    assert.equal(QC_PARAMETERS[key].category, 'COMMUNICATION_QUALITY');
  }
});

test('QC Parameters - ART & AHT deduct 5%', () => {
  assert.equal(QC_PARAMETERS.ART.deduction, 5);
  assert.equal(QC_PARAMETERS.AHT.deduction, 5);
});

test('QC Deterministic Checks - Profanity / Rude agent flagged as POOR_INTERACTION_HANDLING', () => {
  const messages = [
    { senderType: 'CUSTOMER', content: 'Can I get a refund?' },
    { senderType: 'AGENT', content: 'fuck off' },
  ];
  const { l1Violations } = runDeterministicQcChecks({
    messages,
    conversation: { status: 'ACTIVE' },
    metrics: {},
  });

  const poorHandling = l1Violations.find((v) => v.code === 'POOR_INTERACTION_HANDLING');
  assert.ok(poorHandling, 'POOR_INTERACTION_HANDLING must be flagged');
  assert.equal(poorHandling.deduction, 10);
});

test('QC Deterministic Checks - Missing greeting flagged as GREETING_ERROR', () => {
  const messages = [
    { senderType: 'CUSTOMER', content: 'Where is my flight?' },
    { senderType: 'AGENT', content: 'What is your PNR?' },
  ];
  const { l1Violations } = runDeterministicQcChecks({
    messages,
    conversation: { status: 'ACTIVE' },
    metrics: {},
  });

  const greetingErr = l1Violations.find((v) => v.code === 'GREETING_ERROR');
  assert.ok(greetingErr, 'GREETING_ERROR must be flagged');
  assert.equal(greetingErr.deduction, 5);
});

test('QC Deterministic Checks - Ignored escalation flagged as ESCALATION_DELAY', () => {
  const messages = [
    { senderType: 'CUSTOMER', content: 'I want to speak with your supervisor right now.' },
    { senderType: 'AGENT', content: 'No, I can help you here. What do you need?' },
  ];
  const { l1Violations, l2Violations } = runDeterministicQcChecks({
    messages,
    conversation: { status: 'ACTIVE' },
    metrics: {},
  });

  const l1Delay = l1Violations.find((v) => v.code === 'ESCALATION_DELAY');
  assert.ok(l1Delay, 'L1 ESCALATION_DELAY must be flagged');
  const l2Delay = l2Violations.find((v) => v.code === 'ESCALATION_DELAY');
  assert.ok(l2Delay, 'L2 ESCALATION_DELAY must be flagged');
});

test('QC Metrics - ART latency calculation flags > 60s', () => {
  const baseTime = Date.now();
  const messages = [
    { senderType: 'CUSTOMER', content: 'Hello', createdAt: new Date(baseTime) },
    { senderType: 'AGENT', content: 'Hi there', createdAt: new Date(baseTime + 85000) }, // 85s
  ];
  const metrics = calculateConversationMetrics(messages, { startedAt: new Date(baseTime) });
  assert.equal(metrics.artSeconds, 85);
  assert.equal(metrics.artExceeded, true);
});

test('QC Metrics - AHT duration calculation flags > 240s', () => {
  const baseTime = Date.now();
  const messages = [
    { senderType: 'CUSTOMER', content: 'Hello', createdAt: new Date(baseTime) },
    { senderType: 'AGENT', content: 'Hi there', createdAt: new Date(baseTime + 10000) },
  ];
  const metrics = calculateConversationMetrics(messages, {
    startedAt: new Date(baseTime - 300000), // 300s (5 mins)
    endedAt: new Date(baseTime),
  });
  assert.ok(metrics.ahtSeconds >= 300);
  assert.equal(metrics.ahtExceeded, true);
});
