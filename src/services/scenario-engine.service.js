/**
 * Scenario Engine Service
 * Validates deterministic state-machine transitions, permitted fact disclosures,
 * and tracks objective completion without allowing LLM hallucinations to force transitions.
 */

export const initializeScenarioState = (scenario) => {
  return {
    currentState: scenario.initialState,
    visitedStates: [scenario.initialState],
    turnCount: 0,
    acceptedTransitions: 0,
    isTerminal: scenario.terminalStates.includes(scenario.initialState),
    maxTurns: scenario.maxTurns || 20,
    customerObjective: scenario.customerObjective,
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

  const transition = (stateDef.transitions || []).find((t) => t.event === eventType);

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
