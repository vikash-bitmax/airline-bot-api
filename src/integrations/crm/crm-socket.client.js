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

    socket.on('connect', () => {
      logger.info(`CRM Socket connected for conversation ${conversationId} (Chat: ${chatId})`);
      socket.emit('chat:join', { chatId }, (ack) => {
        logger.debug(`Joined CRM chat ${chatId}:`, ack);
      });
    });

    socket.on('chat:message:new', (msg) => {
      // Discard customer's own echoes; only process AGENT or SYSTEM messages
      if (msg.senderRole !== 'PASSENGER') {
        if (onAgentMessage) onAgentMessage(msg);
      }
    });

    socket.on('chat:message', (msg) => {
      if (msg.senderRole !== 'PASSENGER') {
        if (onAgentMessage) onAgentMessage(msg);
      }
    });

    socket.on('chat:assigned', (data) => {
      if (onCrmEvent) onCrmEvent({ eventType: 'CHAT_ASSIGNED', data });
    });

    socket.on('chat:transferred', (data) => {
      if (onCrmEvent) onCrmEvent({ eventType: 'CHAT_TRANSFERRED', data });
    });

    socket.on('chat:escalated', (data) => {
      if (onCrmEvent) onCrmEvent({ eventType: 'CHAT_ESCALATED', data });
    });

    socket.on('chat:status:changed', (data) => {
      if (onCrmEvent) onCrmEvent({ eventType: 'CHAT_STATUS_CHANGED', data });
    });

    socket.on('connect_error', (err) => {
      logger.warn(`CRM Socket error for conversation ${conversationId}: ${err.message}`);
    });

    this.activeSockets.set(conversationId, socket);
    return socket;
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
