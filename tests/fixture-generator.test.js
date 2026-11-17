import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCustomerFixture } from '../src/services/fixture-generator.service.js';

test('Fixture Generator - Determinism with Same Seed and ConversationId', () => {
  const seed = 'test-deterministic-seed-123';
  const conversationId = 'CONV-A1B2C3D4';

  const fixtureA = generateCustomerFixture({ randomSeed: seed, conversationId });
  const fixtureB = generateCustomerFixture({ randomSeed: seed, conversationId });

  assert.deepEqual(fixtureA.facts, fixtureB.facts);
  assert.equal(fixtureA.facts.pnr, fixtureB.facts.pnr);
  assert.equal(fixtureA.facts.passengerName, fixtureB.facts.passengerName);
  assert.equal(fixtureA.facts.passengerEmail, fixtureB.facts.passengerEmail);
});

test('Fixture Generator - Distinct Fixtures for Different Conversation IDs', () => {
  const seed = 'test-deterministic-seed-123';

  const fixture1 = generateCustomerFixture({ randomSeed: seed, conversationId: 'CONV-001' });
  const fixture2 = generateCustomerFixture({ randomSeed: seed, conversationId: 'CONV-002' });

  // Different conversation IDs generate different seeds
  assert.notEqual(fixture1.seed, fixture2.seed);
});

test('Fixture Generator - Synthetic Data Validation', () => {
  const fixture = generateCustomerFixture({ randomSeed: 'seed-xyz', conversationId: 'CONV-TEST' });
  const { facts, disclosurePolicies } = fixture;

  // 1. PNR: 6 alphanumeric characters
  assert.match(facts.pnr, /^[A-Z0-9]{6}$/);

  // 2. Email: Must belong to synthetic domain @example.test
  assert.ok(facts.passengerEmail.endsWith('@example.test'));

  // 3. Flight number: Must match standard airline code format
  assert.match(facts.flightNumber, /^SK[0-9]{3}$/);

  // 4. Disclosure policies exist for all facts
  assert.equal(disclosurePolicies.pnr, 'on_request');
  assert.equal(disclosurePolicies.passengerName, 'initial');
});
