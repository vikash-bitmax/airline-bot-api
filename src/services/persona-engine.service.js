/**
 * Persona Engine Service
 * Maintains dynamic emotional state, tracks behavioral counters,
 * agent interaction quality, and builds LLM behavioral instructions.
 */

const clamp = (val, min = 0, max = 10) => Math.max(min, Math.min(max, val));

export const initializePersonaState = (persona = {}) => {
  const traits = persona.traits || persona.behavioralTraits || {};
  const baseline = persona.emotionalBaseline || {};

  const baseEmotion = (traits.emotionalState || baseline.temperament || 'neutral').toLowerCase();
  let initialFrustration = 2;
  if (baseEmotion.includes('angr') || baseEmotion.includes('furious')) initialFrustration = 8;
  else if (baseEmotion.includes('frustrat') || baseEmotion.includes('annoy')) initialFrustration = 6;
  else if (baseEmotion.includes('anxious') || baseEmotion.includes('panic')) initialFrustration = 5;

  return {
    currentEmotionalState: baseEmotion,
    patience: traits.patience ?? baseline.patience ?? 5,
    cooperation: traits.cooperation ?? baseline.cooperativeness ?? 5,
    assertiveness: traits.assertiveness ?? baseline.assertiveness ?? 5,
    trustLevel: traits.trustLevel ?? 5,
    frustration: initialFrustration,
    satisfaction: 5,
    lastAgentBehavior: 'NONE',
    scenarioState: 'INITIAL',
    disclosedFacts: [],
    repetitionCount: 0,
    topicSwitchCount: 0,
    supervisorRequestCount: 0,
    contradictionCount: 0,
    lastUpdatedTurn: 0,
  };
};

export const updatePersonaDynamics = ({
  currentState = {},
  eventType,
  turnNumber = 1,
  lastAgentBehavior,
  scenarioState,
  disclosedFacts,
}) => {
  const next = {
    ...currentState,
    lastUpdatedTurn: turnNumber,
    lastAgentBehavior: lastAgentBehavior || currentState.lastAgentBehavior || eventType || 'STANDARD_ASSISTANCE',
    scenarioState: scenarioState || currentState.scenarioState || 'DISCUSS_OPTIONS',
    disclosedFacts: disclosedFacts || currentState.disclosedFacts || [],
  };

  const behavior = lastAgentBehavior || eventType;

  switch (behavior) {
    case 'EMPATHETIC_SOLUTION':
      next.frustration = clamp(next.frustration - 3);
      next.satisfaction = clamp(next.satisfaction + 3);
      next.trustLevel = clamp(next.trustLevel + 2);
      next.cooperation = clamp(next.cooperation + 1);
      break;

    case 'GENUINE_RESOLUTION':
    case 'REFUND_PROCESSED':
    case 'REBOOKING_COMPLETED':
      next.frustration = clamp(next.frustration - 4);
      next.satisfaction = clamp(next.satisfaction + 4);
      next.trustLevel = clamp(next.trustLevel + 3);
      next.cooperation = clamp(next.cooperation + 2);
      break;

    case 'REPEATED_QUESTION':
      next.frustration = clamp(next.frustration + 2);
      next.satisfaction = clamp(next.satisfaction - 1);
      next.trustLevel = clamp(next.trustLevel - 1);
      next.repetitionCount += 1;
      break;

    case 'RUDE_DISMISSIVE':
      next.frustration = clamp(next.frustration + 4);
      next.satisfaction = clamp(next.satisfaction - 3);
      next.trustLevel = clamp(next.trustLevel - 3);
      next.assertiveness = clamp(next.assertiveness + 2);
      break;

    case 'REPEATED_WAIT':
    case 'LONG_WAIT_TIME':
      next.frustration = clamp(next.frustration + 1);
      next.patience = clamp(next.patience - 1);
      break;

    case 'VAGUE_PROMISE':
      next.frustration = clamp(next.frustration + 1);
      next.trustLevel = clamp(next.trustLevel - 1);
      break;

    case 'APOLOGY_ONLY':
      // A simple apology reduces frustration by at most 1, but does not eliminate it if problem remains unsolved
      next.frustration = clamp(next.frustration - 1);
      // Satisfaction does not increase from apology alone
      break;

    case 'HELPFUL_RESPONSE':
    case 'BOOKING_IDENTIFIED':
    case 'AMENITY_VOUCHER_ISSUED':
      next.frustration = clamp(next.frustration - 2);
      next.trustLevel = clamp(next.trustLevel + 1);
      next.satisfaction = clamp(next.satisfaction + 2);
      break;

    case 'IGNORED_QUESTION':
      next.frustration = clamp(next.frustration + 2);
      next.trustLevel = clamp(next.trustLevel - 1);
      next.satisfaction = clamp(next.satisfaction - 1);
      break;

    case 'UNHELPFUL_RESPONSE':
    case 'CLARIFICATION_REJECTED':
      next.frustration = clamp(next.frustration + 2);
      next.satisfaction = clamp(next.satisfaction - 2);
      break;

    case 'SUPERVISOR_REQUESTED':
    case 'ESCALATION_OFFERED':
      next.supervisorRequestCount += 1;
      next.assertiveness = clamp(next.assertiveness + 1);
      break;

    default:
      // Neutral turn
      break;
  }

  // Derive discrete emotional state label with hysteresis
  if (next.frustration >= 8) {
    next.currentEmotionalState = 'angry';
  } else if (next.frustration >= 5) {
    next.currentEmotionalState = 'frustrated';
  } else if (next.satisfaction >= 8 && next.frustration <= 3) {
    next.currentEmotionalState = 'happy';
  } else if (next.satisfaction >= 6 && next.frustration <= 4) {
    next.currentEmotionalState = 'cooperative';
  } else if (next.trustLevel >= 7 && next.frustration <= 3) {
    next.currentEmotionalState = 'calm';
  } else {
    next.currentEmotionalState = 'neutral';
  }

  return next;
};

export const buildPersonaPromptContext = ({ persona = {}, dynamicState = {} }) => {
  const style = persona.communicationStyle || {};
  const behavior = persona.behaviorConfig || {};

  return {
    personaId: persona.personaId,
    name: persona.name || 'Passenger',
    category: persona.category,
    tone: style.tone || 'neutral',
    messageLength: style.messageLength || 'moderate',
    englishProficiency: style.englishProficiency || 'fluent',
    emojiUsage: style.emojiUsage || 'none',
    language: style.language || 'en',
    emotionalState: dynamicState.currentEmotionalState || 'neutral',
    frustration: dynamicState.frustration ?? 3,
    trustLevel: dynamicState.trustLevel ?? 5,
    satisfaction: dynamicState.satisfaction ?? 5,
    assertiveness: dynamicState.assertiveness ?? 5,
    lastAgentBehavior: dynamicState.lastAgentBehavior || 'NONE',
    disclosedFacts: dynamicState.disclosedFacts || [],
    shouldRequestSupervisor:
      (behavior.supervisorRequests?.enabled &&
        dynamicState.frustration >= 7 &&
        dynamicState.supervisorRequestCount < (behavior.supervisorRequests?.afterUnresolvedAttempts || 2)) ||
      dynamicState.frustration >= 8,
    shouldRepeatQuestion:
      behavior.repetition?.enabled && dynamicState.repetitionCount < (behavior.repetition?.maxRepeats || 2),
    shouldSwitchTopic:
      behavior.topicSwitching?.enabled && dynamicState.topicSwitchCount < (behavior.topicSwitching?.maxSwitches || 1),
  };
};

export default {
  initializePersonaState,
  updatePersonaDynamics,
  buildPersonaPromptContext,
};
