import { v4 as uuidv4 } from 'uuid';
import Conversation from '../models/Conversation.model.js';
import ConversationEvent from '../models/ConversationEvent.model.js';
import { broadcastEvent } from '../../server.js';
import logger from '../utils/logger.js';

export const recordConversationEvent = async ({
  conversationId,
  eventType,
  source,
  evidenceType,
  evidenceReference,
  previousState,
  currentState,
  payload = {},
  idempotencyKey,
}) => {
  if (idempotencyKey) {
    const existing = await ConversationEvent.findOne({ idempotencyKey }).lean();
    if (existing) return existing;
  }

  const eventId = `EVT-${uuidv4().substring(0, 8).toUpperCase()}`;

  const eventDoc = await ConversationEvent.create({
    eventId,
    conversation: conversationId,
    eventType,
    source,
    evidenceType,
    evidenceReference,
    previousState,
    currentState,
    payload,
    idempotencyKey,
    occurredAt: new Date(),
  });

  broadcastEvent('conversation:event', {
    conversationId,
    event: eventDoc.toObject(),
  });

  return eventDoc.toObject();
};

export const updateConversationProgress = async ({
  conversationId,
  dynamicPersonaState,
  currentScenarioState,
  status,
  endReason,
}) => {
  const update = {
    $set: {
      ...(dynamicPersonaState && { dynamicPersonaState }),
      ...(currentScenarioState && {
        'scenarioProgress.currentState': currentScenarioState.currentState,
        'scenarioProgress.visitedStates': currentScenarioState.visitedStates,
        'scenarioProgress.turnCount': currentScenarioState.turnCount,
      }),
      ...(status && { status }),
      ...(endReason && { endReason, endedAt: new Date() }),
    },
  };

  const updated = await Conversation.findByIdAndUpdate(conversationId, update, { new: true }).lean();

  broadcastEvent('conversation:updated', {
    conversationId: updated.conversationId,
    status: updated.status,
    currentState: updated.scenarioProgress?.currentState,
    dynamicPersonaState: updated.dynamicPersonaState,
  });

  return updated;
};

export default {
  recordConversationEvent,
  updateConversationProgress,
};
