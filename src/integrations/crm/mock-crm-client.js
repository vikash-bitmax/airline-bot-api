import { EventEmitter } from 'events';
import logger from '../../utils/logger.js';

export class MockCrmClient extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map();
  }

  async startCustomerSession({ customerName, passengerEmail, pnr, flightNumber, initialMessage }) {
    const chatId = `CHAT-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
    const token = `mock-token-${Math.random().toString(36).substring(2, 15)}`;

    const session = {
      chatId,
      customerSessionToken: token,
      customerName,
      passengerEmail,
      pnr,
      flightNumber,
      status: 'WAITING',
      assigned: false,
      messages: [],
    };

    if (initialMessage) {
      session.messages.push({
        senderRole: 'PASSENGER',
        text: initialMessage,
        createdAt: new Date(),
      });
    }

    this.sessions.set(chatId, session);

    // Simulate immediate agent assignment and acknowledgement
    setTimeout(() => {
      session.status = 'IN_PROGRESS';
      session.assigned = true;
      this.emit('chat:assigned', { chatId, agentName: 'Agent Alice', agentId: 'USR-AGENT-01' });

      // Auto-reply asking for details or greeting
      const reply = {
        senderRole: 'AGENT',
        senderName: 'Agent Alice',
        text: 'Hello, thank you for reaching SkyWings Support. May I have your PNR booking reference to assist you?',
        createdAt: new Date(),
      };
      session.messages.push(reply);
      this.emit('chat:message:new', { chatId, message: reply });
    }, 500);

    return {
      chatId,
      customerSessionToken: token,
      status: session.status,
      assigned: session.assigned,
    };
  }

  async sendCustomerMessage({ chatId, text }) {
    const session = this.sessions.get(chatId);
    if (!session) throw new Error('Mock CRM session not found');

    session.messages.push({
      senderRole: 'PASSENGER',
      text,
      createdAt: new Date(),
    });

    // Simulate smart agent response
    setTimeout(() => {
      let agentReply = 'Thank you for providing that information. I have verified your booking details.';
      if (text.match(/[A-Z0-9]{6}/)) {
        agentReply = 'I have identified your booking reference. Your flight was cancelled due to air traffic control. I can offer a full refund or rebook you onto the next flight.';
      } else if (text.toLowerCase().includes('refund')) {
        agentReply = 'I have processed your refund request back to your original payment method. Is there anything else I can help with?';
      }

      const msg = {
        senderRole: 'AGENT',
        senderName: 'Agent Alice',
        text: agentReply,
        createdAt: new Date(),
      };
      session.messages.push(msg);
      this.emit('chat:message:new', { chatId, message: msg });
    }, 500);

    return { success: true };
  }

  async closeCustomerSession({ chatId }) {
    const session = this.sessions.get(chatId);
    if (session) {
      session.status = 'CLOSED';
      this.emit('chat:status:changed', { chatId, status: 'CLOSED' });
    }
    return { success: true };
  }
}

export default new MockCrmClient();
