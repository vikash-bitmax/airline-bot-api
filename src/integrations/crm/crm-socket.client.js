import { io } from 'socket.io-client';
import { env } from '../../config/environment.js';
import logger from '../../utils/logger.js';

export class CrmSocketClient {
  constructor(socketUrl = env.CRM.SOCKET_URL) {
    this.socketUrl = socketUrl;
    this.activeSockets = new Map(); // conversationId -> socket
  }

  connectForConversation({ conversationId, chatId, token, onAgentMessage, onCrmEvent }) {
    if (this.activeSockets.has(conversationId)) {
      return this.activeSockets.get(conversationId);
    }

    const socket = io(this.socketUrl, {
      auth: { chatSessionToken: token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    const processedMessages = new Set();

    socket.on('connect', () => {
      logger.info(`CRM Socket connected for conversation ${conversationId} (Chat: ${chatId})`);
      socket.emit('chat:join', { chatId }, (ack) => {
        if (ack && ack.success === false) {
          logger.error(`CRM chat:join rejected for ${chatId}: ${ack.message || ack.code}`);
        } else {
          logger.info(`Joined CRM chat room successfully: ${chatId}`);
        }
      });
    });

    const handleIncomingMessage = (msg) => {
      if (!msg) return;
      const msgId = msg.id || msg._id || msg.clientMessageId;
      if (msgId && processedMessages.has(msgId)) return;
      if (msgId) processedMessages.add(msgId);

      // Only AGENT messages should trigger an AI customer reply turn
      if (msg.senderRole === 'AGENT') {
        logger.info(`CRM Socket received AGENT turn for ${chatId}: "${msg.text}"`);
        if (onAgentMessage) onAgentMessage(msg);
      } else if (msg.senderRole === 'SYSTEM') {
        logger.info(`CRM Socket received SYSTEM notification for ${chatId}: "${msg.text}"`);
        if (onCrmEvent) onCrmEvent({ eventType: 'SYSTEM_MESSAGE', data: msg });
      }
    };

    socket.on('chat:message:new', handleIncomingMessage);
    socket.on('chat:message', handleIncomingMessage);

    socket.on('chat:assigned', (data) => {
      if (onCrmEvent) onCrmEvent({ eventType: 'CHAT_ASSIGNED', data });
    });

    socket.on('chat:transferred', (data) => {
      if (onCrmEvent) onCrmEvent({ eventType: 'CHAT_TRANSFERRED', data });
    });

    socket.on('chat:escalated', (data) => {
      if (onCrmEvent) onCrmEvent({ eventType: 'CHAT_ESCALATED', data });
    });

    // CRM emits 'chat:status' when resolve/close/escalate happens via HTTP or socket
    socket.on('chat:status', (data) => {
      logger.info(`CRM chat:status update for ${chatId}: ${JSON.stringify(data?.status || data)}`);
      if (onCrmEvent) onCrmEvent({ eventType: 'CHAT_STATUS_CHANGED', data });
    });

    socket.on('chat:status:changed', (data) => {
      logger.info(`CRM chat:status:changed for ${chatId}: ${JSON.stringify(data?.status || data)}`);
      if (onCrmEvent) onCrmEvent({ eventType: 'CHAT_STATUS_CHANGED', data });
    });

    socket.on('connect_error', (err) => {
      logger.warn(`CRM Socket error for conversation ${conversationId}: ${err.message}`);
    });

    this.activeSockets.set(conversationId, socket);
    return socket;
  }

  /**
   * Emit typing indicator on the CRM chat room.
   * The CRM chatSocket broadcasts 'chat:typing' to all room participants.
   */
  emitTyping(conversationId, chatId, isTyping) {
    const socket = this.activeSockets.get(conversationId);
    if (socket && socket.connected) {
      socket.emit('chat:typing', { chatId, isTyping }, (ack) => {
        if (ack && ack.success === false) {
          logger.debug(`CRM typing indicator failed for ${chatId}: ${ack.message || ack.code}`);
        }
      });
    }
  }

  disconnectConversation(conversationId) {
    const socket = this.activeSockets.get(conversationId);
    if (socket) {
      socket.disconnect();
      this.activeSockets.delete(conversationId);
      logger.info(`Disconnected CRM socket for conversation ${conversationId}`);
    }
  }

  disconnectAll() {
    for (const [id, s] of this.activeSockets.entries()) {
      s.disconnect();
    }
    this.activeSockets.clear();
  }
}

export default new CrmSocketClient();
