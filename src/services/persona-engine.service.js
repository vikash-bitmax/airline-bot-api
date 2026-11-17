/**
 * Persona Engine Service
 * Maintains dynamic emotional state, tracks behavioral counters,
 * and builds LLM behavioral instructions without generating natural language directly.
 */

const clamp = (val, min = 0, max = 10) => Math.max(min, Math.min(max, val));

export const initializePersonaState = (persona) => {
  return {
    currentEmotionalState: persona.traits?.emotionalState || 'neutral',
    patience: persona.traits?.patience ?? 5,
    cooperation: persona.traits?.cooperation ?? 5,
    assertiveness: persona.traits?.assertiveness ?? 5,
    trustLevel: persona.traits?.trustLevel ?? 5,
    frustration: persona.traits?.emotionalState === 'angry' ? 8 : (persona.traits?.emotionalState === 'frustrated' ? 6 : 2),
    satisfaction: 5,
    repetitionCount: 0,
    topicSwitchCount: 0,
    supervisorRequestCount: 0,
    contradictionCount: 0,
    lastUpdatedTurn: 0,
  };
};

export const updatePersonaDynamics = ({ currentState, eventType, turnNumber }) => {
  const next = { ...currentState, lastUpdatedTurn: turnNumber };

  switch (eventType) {
    case 'HELPFUL_RESPONSE':
    case 'BOOKING_IDENTIFIED':
    case 'AMENITY_VOUCHER_ISSUED':
    case 'REFUND_PROCESSED':
    case 'REBOOKING_COMPLETED':
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

    case 'LONG_WAIT_TIME':
      next.frustration = clamp(next.frustration + 1);
      next.patience = clamp(next.patience - 1);
      break;

    case 'SUPERVISOR_REQUESTED':
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
  } else if (next.satisfaction >= 8) {
    next.currentEmotionalState = 'happy';
  } else if (next.trustLevel >= 7 && next.frustration <= 3) {
    next.currentEmotionalState = 'calm';
  } else {
    next.currentEmotionalState = 'neutral';
  }

  return next;
};

export const buildPersonaPromptContext = ({ persona, dynamicState }) => {
  const style = persona.communicationStyle || {};
  const behavior = persona.behaviorConfig || {};

  return {
    personaId: persona.personaId,
    name: persona.name,
    category: persona.category,
    tone: style.tone || 'neutral',
    messageLength: style.messageLength || 'moderate',
    englishProficiency: style.englishProficiency || 'fluent',
    emojiUsage: style.emojiUsage || 'none',
    language: style.language || 'en',
    emotionalState: dynamicState.currentEmotionalState,
    frustration: dynamicState.frustration,
    trustLevel: dynamicState.trustLevel,
    satisfaction: dynamicState.satisfaction,
    assertiveness: dynamicState.assertiveness,
    shouldRequestSupervisor:
      behavior.supervisorRequests?.enabled &&
      dynamicState.frustration >= 7 &&
      dynamicState.supervisorRequestCount < (behavior.supervisorRequests?.afterUnresolvedAttempts || 2),
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
