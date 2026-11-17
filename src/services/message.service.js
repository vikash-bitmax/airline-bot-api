import { v4 as uuidv4 } from 'uuid';
import Conversation from '../models/Conversation.model.js';
import ConversationMessage from '../models/ConversationMessage.model.js';
import { broadcastEvent } from '../../server.js';
import logger from '../utils/logger.js';

export const createMessage = async ({
  conversationId,
  senderType,
  senderId,
  content,
  messageType = 'TEXT',
  crmMessageId,
  idempotencyKey,
  aiMetadata,
  intent,
  emotionExpression,
}) => {
  // Idempotency check
  if (idempotencyKey) {
    const existing = await ConversationMessage.findOne({ idempotencyKey }).lean();
    if (existing) {
      return { message: existing, duplicate: true };
    }
  }

  // Atomically increment messageSequence on Conversation to guarantee concurrency safety
  const updatedConv = await Conversation.findOneAndUpdate(
    { _id: conversationId },
    { $inc: { messageSequence: 1 } },
    { new: true }
  );

  if (!updatedConv) {
    throw new Error(`Conversation not found for ID: ${conversationId}`);
  }

  const sequenceNumber = updatedConv.messageSequence;
  const messageId = `MSG-${uuidv4().substring(0, 8).toUpperCase()}`;

  const messageDoc = await ConversationMessage.create({
    messageId,
    conversation: conversationId,
    sequenceNumber,
    senderType,
    senderId,
    content,
    messageType,
    crmMessageId,
    deliveryStatus: senderType === 'CUSTOMER' ? 'DELIVERED' : 'SENT',
    idempotencyKey,
    aiMetadata,
    intent,
    emotionExpression,
    sentAt: new Date(),
  });

  // Real-time broadcast for dashboard
  broadcastEvent('conversation:message', {
    conversationId: updatedConv.conversationId,
    message: messageDoc.toObject(),
  });

  return { message: messageDoc.toObject(), duplicate: false };
};

export const getConversationMessages = async (conversationId, { page = 1, limit = 50 } = {}) => {
  const skip = (page - 1) * limit;
  const [messages, total] = await Promise.all([
    ConversationMessage.find({ conversation: conversationId })
      .sort({ sequenceNumber: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ConversationMessage.countDocuments({ conversation: conversationId }),
  ]);

  return {
    messages,
    total,
    page,
    pages: Math.ceil(total / limit),
  };
};

export const replayConversation = async (conversationId) => {
  const messages = await ConversationMessage.find({ conversation: conversationId })
    .sort({ sequenceNumber: 1 })
    .lean();
  return messages;
};

export default {
  createMessage,
  getConversationMessages,
  replayConversation,
};
