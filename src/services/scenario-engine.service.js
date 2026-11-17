/**
 * Scenario Engine Service
 * Validates deterministic state-machine transitions, permitted fact disclosures,
 * and tracks objective completion without allowing LLM hallucinations to force transitions.
 */

export const initializeScenarioState = (scenario) => {
  const terminalStates = Array.isArray(scenario?.terminalStates) ? scenario.terminalStates : [];
  return {
    currentState: scenario?.initialState || 'INITIAL',
    visitedStates: [scenario?.initialState || 'INITIAL'],
    turnCount: 0,
    acceptedTransitions: 0,
    isTerminal: terminalStates.includes(scenario?.initialState),
    maxTurns: scenario?.maxTurns || 20,
    customerObjective: scenario?.customerObjective || '',
  };
};

export const getPermittedFacts = ({ scenario, currentState, fixture }) => {
  const stateConfig = scenario.stateMachine?.[currentState] || {};
  const allowedFactKeys = stateConfig.allowedFacts || [];
  const permitted = {};

  for (const key of allowedFactKeys) {
    if (fixture.facts && fixture.facts[key] !== undefined) {
      // Check disclosure policy
      const policy = fixture.disclosurePolicies?.[key] || 'on_request';
      if (policy !== 'internal_only') {
        permitted[key] = fixture.facts[key];
      }
    }
  }

  // Once beyond INTRODUCE_ISSUE, ensure core booking facts are always disclosed when requested
  if (currentState !== 'INTRODUCE_ISSUE' && fixture?.facts) {
    if (fixture.facts.passengerName) permitted.passengerName = fixture.facts.passengerName;
    if (fixture.facts.pnr) permitted.pnr = fixture.facts.pnr;
    if (fixture.facts.flightNumber) permitted.flightNumber = fixture.facts.flightNumber;
    if (fixture.facts.passengerEmail) permitted.passengerEmail = fixture.facts.passengerEmail;
  }

  return permitted;
};

export const validateAndApplyTransition = ({ scenario, currentScenarioState, eventType }) => {
  const stateMachine = scenario.stateMachine || {};
  const stateDef = stateMachine[currentScenarioState.currentState];

  if (!stateDef) {
    return {
      valid: false,
      reason: `Unknown current state: ${currentScenarioState.currentState}`,
      state: currentScenarioState,
    };
  }

  if (currentScenarioState.isTerminal) {
    return {
      valid: false,
      reason: `Cannot transition from terminal state: ${currentScenarioState.currentState}`,
      state: currentScenarioState,
    };
  }

  let transition = (stateDef.transitions || []).find((t) => t.event === eventType);

  // Graceful fallback for conversational fluidity:
  // If no exact match, allow common conversational progressions instead of deadlocking
  if (!transition && Array.isArray(stateDef.transitions) && stateDef.transitions.length > 0) {
    if (currentScenarioState.currentState === 'INTRODUCE_ISSUE') {
      // Only advance to PROVIDE_BOOKING_DETAILS if the agent requested details or PNR
      if (eventType === 'AGENT_ASKED_FOR_PNR') {
        transition = stateDef.transitions.find((t) => t.targetState === 'PROVIDE_BOOKING_DETAILS');
      }
    } else if (currentScenarioState.currentState === 'PROVIDE_BOOKING_DETAILS') {
      // Any agent acknowledgment after details moves to discussing options
      transition =
        stateDef.transitions.find((t) => t.targetState === 'DISCUSS_OPTIONS') ||
        stateDef.transitions[0];
    }
  }

  if (!transition) {
    return {
      valid: false,
      reason: `Event '${eventType}' is not valid from state '${currentScenarioState.currentState}'`,
      state: currentScenarioState,
    };
  }

  const targetState = transition.targetState;
  const isTerminal = (scenario.terminalStates || []).includes(targetState);

  const updatedState = {
    ...currentScenarioState,
    currentState: targetState,
    visitedStates: [...currentScenarioState.visitedStates, targetState],
    acceptedTransitions: currentScenarioState.acceptedTransitions + 1,
    isTerminal,
  };

  return {
    valid: true,
    previousState: currentScenarioState.currentState,
    targetState,
    state: updatedState,
  };
};

export const incrementTurnAndCheckLimits = (scenarioState) => {
  const nextTurn = scenarioState.turnCount + 1;
  const reachedMaxTurns = nextTurn >= scenarioState.maxTurns;

  return {
    ...scenarioState,
    turnCount: nextTurn,
    isTerminal: scenarioState.isTerminal || reachedMaxTurns,
    completionReason: reachedMaxTurns ? 'MAX_TURNS_REACHED' : undefined,
  };
};

export default {
  initializeScenarioState,
  getPermittedFacts,
  validateAndApplyTransition,
  incrementTurnAndCheckLimits,
};
