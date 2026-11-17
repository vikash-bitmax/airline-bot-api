import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initializeScenarioState,
  getPermittedFacts,
  validateAndApplyTransition,
  incrementTurnAndCheckLimits,
} from '../src/services/scenario-engine.service.js';

const mockScenario = {
  scenarioId: 'S001',
  name: 'Flight Cancellation',
  initialState: 'INTRODUCE_ISSUE',
  terminalStates: ['COMPLETED', 'ESCALATED', 'ABANDONED'],
  customerObjective: 'Obtain rebooking or refund',
  maxTurns: 5,
  stateMachine: {
    INTRODUCE_ISSUE: {
      allowedFacts: ['passengerName', 'route'],
      transitions: [
        { event: 'AGENT_ASKED_FOR_PNR', targetState: 'PROVIDE_BOOKING_DETAILS' },
      ],
    },
    PROVIDE_BOOKING_DETAILS: {
      allowedFacts: ['pnr', 'travelDate'],
      transitions: [
        { event: 'BOOKING_IDENTIFIED', targetState: 'COMPLETED' },
      ],
    },
    COMPLETED: {
      allowedFacts: [],
      transitions: [],
    },
  },
};

test('Scenario Engine - Initialization', () => {
  const state = initializeScenarioState(mockScenario);
  assert.equal(state.currentState, 'INTRODUCE_ISSUE');
  assert.equal(state.isTerminal, false);
  assert.equal(state.turnCount, 0);
  assert.deepEqual(state.visitedStates, ['INTRODUCE_ISSUE']);
});

test('Scenario Engine - Permitted Facts Filtering', () => {
  const fixture = {
    facts: {
      passengerName: 'Alexander Smith',
      route: 'LHR -> JFK',
      pnr: 'SK89F2',
      internalNote: 'VIP tier passenger',
    },
    disclosurePolicies: {
      passengerName: 'initial',
      route: 'initial',
      pnr: 'on_request',
      internalNote: 'internal_only',
    },
  };

  // State 1 allows passengerName and route, but not PNR or internal notes
  const factsState1 = getPermittedFacts({
    scenario: mockScenario,
    currentState: 'INTRODUCE_ISSUE',
    fixture,
  });

  assert.equal(factsState1.passengerName, 'Alexander Smith');
  assert.equal(factsState1.route, 'LHR -> JFK');
  assert.equal(factsState1.pnr, undefined);
  assert.equal(factsState1.internalNote, undefined);
});

test('Scenario Engine - Valid and Invalid State Transitions', () => {
  const initialState = initializeScenarioState(mockScenario);

  // 1. Invalid transition from current state
  const invalidResult = validateAndApplyTransition({
    scenario: mockScenario,
    currentScenarioState: initialState,
    eventType: 'BOOKING_IDENTIFIED', // Not valid from INTRODUCE_ISSUE
  });
  assert.equal(invalidResult.valid, false);

  // 2. Valid transition
  const validResult = validateAndApplyTransition({
    scenario: mockScenario,
    currentScenarioState: initialState,
    eventType: 'AGENT_ASKED_FOR_PNR',
  });
  assert.equal(validResult.valid, true);
  assert.equal(validResult.targetState, 'PROVIDE_BOOKING_DETAILS');
  assert.equal(validResult.state.currentState, 'PROVIDE_BOOKING_DETAILS');

  // 3. Transition to Terminal State
  const terminalResult = validateAndApplyTransition({
    scenario: mockScenario,
    currentScenarioState: validResult.state,
    eventType: 'BOOKING_IDENTIFIED',
  });
  assert.equal(terminalResult.valid, true);
  assert.equal(terminalResult.state.isTerminal, true);

  // 4. Cannot transition further once in terminal state
  const postTerminalResult = validateAndApplyTransition({
    scenario: mockScenario,
    currentScenarioState: terminalResult.state,
    eventType: 'ANY_EVENT',
  });
  assert.equal(postTerminalResult.valid, false);
});

test('Scenario Engine - Maximum Turn Enforcement', () => {
  let state = initializeScenarioState(mockScenario);
  for (let i = 0; i < 5; i++) {
    state = incrementTurnAndCheckLimits(state);
  }

  assert.equal(state.turnCount, 5);
  assert.equal(state.isTerminal, true);
  assert.equal(state.completionReason, 'MAX_TURNS_REACHED');
});
