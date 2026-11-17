import { env } from '../../config/environment.js';
import logger from '../../utils/logger.js';

export class CrmClient {
  constructor(baseUrl = env.CRM.BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async _safeParseJson(response, operationName) {
    const rawText = await response.text();
    let resData;
    try {
      resData = JSON.parse(rawText);
    } catch {
      const preview = rawText.slice(0, 200).replace(/\s+/g, ' ');
      throw new Error(`CRM API ${operationName} returned non-JSON HTTP ${response.status}: ${preview}`);
    }
    return resData;
  }

  async startCustomerSession({
    customerName,
    passengerEmail,
    pnr,
    flightNumber,
    category = 'DISRUPTION',
    initialMessage,
  }) {
    const url = `${this.baseUrl}/api/v1/chat/sessions`;
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

      const resData = await this._safeParseJson(response, 'startCustomerSession');
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
    const url = `${this.baseUrl}/api/v1/chat/sessions/${encodeURIComponent(chatId)}/messages`;
    const payload = {
      text,
      clientMessageId: clientMessageId || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-chat-session-token': token,
        },
        body: JSON.stringify(payload),
      });

      const resData = await this._safeParseJson(response, 'sendCustomerMessage');
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
    const url = `${this.baseUrl}/api/v1/chat/sessions/${encodeURIComponent(chatId)}/close`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-chat-session-token': token,
        },
      });

      const resData = await this._safeParseJson(response, 'closeCustomerSession');
      return resData;
    } catch (err) {
      logger.error(`CRM closeCustomerSession failed: ${err.message}`);
      throw err;
    }
  }
}

export default new CrmClient();
