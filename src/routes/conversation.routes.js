import { Router } from 'express';
import {
  getConversations,
  getConversationDetails,
  getConversationMessagesList,
  getConversationEventsList,
  replayConversationEndpoint,
  stopConversation,
  stopAllConversations,
  deleteConversation,
  raiseConversationQuery,
} from '../controllers/conversation.controller.js';

const router = Router();

router.get('/', getConversations);
router.post('/raise-query', raiseConversationQuery);
router.post('/support', raiseConversationQuery);
router.post('/stop-all', stopAllConversations);
router.get('/:conversationId', getConversationDetails);
router.get('/:conversationId/messages', getConversationMessagesList);
router.get('/:conversationId/events', getConversationEventsList);
router.get('/:conversationId/replay', replayConversationEndpoint);
router.post('/:conversationId/stop', stopConversation);
router.delete('/:conversationId', deleteConversation);

export default router;
