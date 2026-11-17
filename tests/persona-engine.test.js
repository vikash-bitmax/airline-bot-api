import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initializePersonaState,
  updatePersonaDynamics,
  buildPersonaPromptContext,
} from '../src/services/persona-engine.service.js';

test('Persona Engine - Initialization and Trait Preservation', () => {
  const persona = {
    personaId: 'P001',
    name: 'Calm Frequent Flyer',
    category: 'personality',
    traits: {
      emotionalState: 'calm',
      patience: 9,
      cooperation: 9,
      assertiveness: 6,
      trustLevel: 8,
    },
    communicationStyle: {
      tone: 'polite',
      messageLength: 'concise',
      englishProficiency: 'fluent',
      emojiUsage: 'none',
      language: 'en',
    },
    behaviorConfig: {
      responseDelayMs: 2000,
    },
  };

  const dynamicState = initializePersonaState(persona);

  assert.equal(dynamicState.currentEmotionalState, 'calm');
  assert.equal(dynamicState.patience, 9);
  assert.equal(dynamicState.trustLevel, 8);
  assert.equal(dynamicState.repetitionCount, 0);

  // Original persona object remains unchanged
  assert.equal(persona.traits.patience, 9);
});

test('Persona Engine - Dynamic Metric Clamping and Transitions', () => {
  const initialState = {
    currentEmotionalState: 'calm',
    patience: 5,
    cooperation: 5,
    assertiveness: 5,
    trustLevel: 5,
    frustration: 4,
    satisfaction: 5,
    repetitionCount: 0,
    topicSwitchCount: 0,
    supervisorRequestCount: 0,
  };

  // Helpful response decreases frustration and increases satisfaction
  const stateAfterHelp = updatePersonaDynamics({
    currentState: initialState,
    eventType: 'HELPFUL_RESPONSE',
    turnNumber: 1,
  });

  assert.equal(stateAfterHelp.frustration, 2);
  assert.equal(stateAfterHelp.satisfaction, 7);
  assert.equal(stateAfterHelp.trustLevel, 6);

  // Repeated unhelpful responses clamped at maximum 10
  let frustratedState = initialState;
  for (let i = 0; i < 6; i++) {
    frustratedState = updatePersonaDynamics({
      currentState: frustratedState,
      eventType: 'UNHELPFUL_RESPONSE',
      turnNumber: i + 2,
    });
  }

  assert.equal(frustratedState.frustration, 10); // Clamped at 10
  assert.equal(frustratedState.satisfaction, 0); // Clamped at 0
  assert.equal(frustratedState.currentEmotionalState, 'angry');
});

test('Persona Engine - Prompt Context Generation', () => {
  const persona = {
    personaId: 'P021',
    name: 'Supervisor Demander',
    category: 'behavioural',
    communicationStyle: { tone: 'aggressive', messageLength: 'concise' },
    behaviorConfig: {
      supervisorRequests: { enabled: true, afterUnresolvedAttempts: 1 },
    },
  };

  const dynamicState = {
    currentEmotionalState: 'angry',
    frustration: 9,
    satisfaction: 1,
    trustLevel: 2,
    assertiveness: 10,
    supervisorRequestCount: 0,
  };

  const promptCtx = buildPersonaPromptContext({ persona, dynamicState });

  assert.equal(promptCtx.tone, 'aggressive');
  assert.equal(promptCtx.shouldRequestSupervisor, true);
  assert.equal(promptCtx.frustration, 9);
});
