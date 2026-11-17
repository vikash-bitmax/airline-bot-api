import Conversation from '../models/Conversation.model.js';
import ConversationMessage from '../models/ConversationMessage.model.js';
import ConversationEvent from '../models/ConversationEvent.model.js';
import conversationOrchestrator from '../services/conversation-orchestrator.service.js';

export const getConversations = async (req, res, next) => {
  try {
    const { status, runId, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (runId) filter['simulationRun'] = runId;

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [conversations, total] = await Promise.all([
      Conversation.find(filter)
        .populate('persona')
        .populate('scenario')
        .populate('simulationRun')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(),
      Conversation.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      total,
      page: parseInt(page, 10),
      pages: Math.ceil(total / parseInt(limit, 10)),
      data: conversations,
    });
  } catch (err) {
    next(err);
  }
};

export const getConversationDetails = async (req, res, next) => {
  try {
    const { conversationId } = req.params;

    const conversation = await Conversation.findOne({ conversationId })
      .populate('persona')
      .populate('scenario')
      .populate('simulationRun')
      .lean();

    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const [messages, events] = await Promise.all([
      ConversationMessage.find({ conversation: conversation._id }).sort({ sequenceNumber: 1 }).lean(),
      ConversationEvent.find({ conversation: conversation._id }).sort({ occurredAt: 1 }).lean(),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        conversation,
        messages,
        events,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getConversationMessagesList = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const conv = await Conversation.findOne({ conversationId });
    if (!conv) return res.status(404).json({ success: false, message: 'Conversation not found' });

    const messages = await ConversationMessage.find({ conversation: conv._id })
      .sort({ sequenceNumber: 1 })
      .lean();

    return res.status(200).json({ success: true, count: messages.length, data: messages });
  } catch (err) {
    next(err);
  }
};

export const getConversationEventsList = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const conv = await Conversation.findOne({ conversationId });
    if (!conv) return res.status(404).json({ success: false, message: 'Conversation not found' });

    const events = await ConversationEvent.find({ conversation: conv._id })
      .sort({ occurredAt: 1 })
      .lean();

    return res.status(200).json({ success: true, count: events.length, data: events });
  } catch (err) {
    next(err);
  }
};

export const replayConversationEndpoint = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const conv = await Conversation.findOne({ conversationId })
      .populate('persona')
      .populate('scenario');

    if (!conv) return res.status(404).json({ success: false, message: 'Conversation not found' });

    const messages = await ConversationMessage.find({ conversation: conv._id })
      .sort({ sequenceNumber: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        conversation: conv,
        transcript: messages,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const stopConversation = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const conv = await Conversation.findOne({ conversationId });
    if (!conv) return res.status(404).json({ success: false, message: 'Conversation not found' });

    await conversationOrchestrator.concludeConversation(conv._id, 'STOPPED_BY_USER');

    return res.status(200).json({ success: true, message: 'Conversation stopped successfully' });
  } catch (err) {
    next(err);
  }
};
