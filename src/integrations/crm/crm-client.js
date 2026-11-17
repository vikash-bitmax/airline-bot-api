import { env } from '../../config/environment.js';
import logger from '../../utils/logger.js';

export class CrmClient {
  constructor(baseUrl = env.CRM.BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async startCustomerSession({
    customerName,
    passengerEmail,
    pnr,
    flightNumber,
    category = 'DISRUPTION',
    initialMessage,
  }) {
    const url = `${this.baseUrl}/api/chat/sessions`;
    const payload = {
      customerName,
      passengerEmail,
      pnr,
      flightNumber,
      category,
      initialMessage,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const resData = await response.json();
      if (!response.ok || !resData.success) {
        throw new Error(resData.message || `Failed to create CRM customer session: ${response.status}`);
      }

      return resData.data;
    } catch (err) {
      logger.error(`CRM startCustomerSession failed: ${err.message}`);
      throw err;
    }
  }

  async sendCustomerMessage({ chatId, text, token, clientMessageId }) {
    const url = `${this.baseUrl}/api/chat/sessions/${encodeURIComponent(chatId)}/messages`;
    const payload = { text, clientMessageId };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-chat-session-token': token,
        },
        body: JSON.stringify(payload),
      });

      const resData = await response.json();
      if (!response.ok || !resData.success) {
        throw new Error(resData.message || `Failed to post CRM message: ${response.status}`);
      }

      return resData.data;
    } catch (err) {
      logger.error(`CRM sendCustomerMessage failed: ${err.message}`);
      throw err;
    }
  }

  async closeCustomerSession({ chatId, token }) {
    const url = `${this.baseUrl}/api/chat/sessions/${encodeURIComponent(chatId)}/close`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-chat-session-token': token,
        },
      });

      const resData = await response.json();
      return resData;
    } catch (err) {
      logger.error(`CRM closeCustomerSession failed: ${err.message}`);
      throw err;
    }
  }
}

export default new CrmClient();
