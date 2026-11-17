/**
 * Event Interpreter Service
 * Classifies agent messages into semantic events and enforces
 * authoritative evidence rules for sensitive CRM transitions.
 */

export const interpretAgentMessage = (text) => {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase();

  // Pattern detection for agent requests and explanations
  if (lower.includes('pnr') || lower.includes('booking reference') || lower.includes('booking code') || lower.includes('ticket number')) {
    return {
      eventType: 'AGENT_ASKED_FOR_PNR',
      confidence: 0.95,
      evidenceType: 'AGENT_MESSAGE',
      description: 'Agent requested PNR or booking reference',
    };
  }

  if (lower.includes('baggage tag') || lower.includes('pir') || lower.includes('claim tag') || lower.includes('tag number')) {
    return {
      eventType: 'AGENT_ASKED_FOR_TAG',
      confidence: 0.92,
      evidenceType: 'AGENT_MESSAGE',
      description: 'Agent requested baggage tag number',
    };
  }

  if (lower.includes('payment reference') || lower.includes('transaction id') || lower.includes('bank reference')) {
    return {
      eventType: 'AGENT_ASKED_FOR_PAYMENT_REF',
      confidence: 0.92,
      evidenceType: 'AGENT_MESSAGE',
      description: 'Agent requested payment reference',
    };
  }

  if (lower.includes('refund') && (lower.includes('eligible') || lower.includes('policy') || lower.includes('process') || lower.includes('initiated'))) {
    return {
      eventType: 'REFUND_OPTIONS_EXPLAINED',
      confidence: 0.88,
      evidenceType: 'AGENT_MESSAGE',
      description: 'Agent explained refund options or policy',
    };
  }

  if (lower.includes('next flight') || lower.includes('alternative') || lower.includes('rebook') || lower.includes('options for you')) {
    return {
      eventType: 'ALTERNATIVE_FLIGHT_OFFERED',
      confidence: 0.88,
      evidenceType: 'AGENT_MESSAGE',
      description: 'Agent offered alternative flight options',
    };
  }

  if (lower.includes('voucher') || lower.includes('meal') || lower.includes('lounge') || lower.includes('refreshment')) {
    return {
      eventType: 'AMENITY_VOUCHER_ISSUED',
      confidence: 0.85,
      evidenceType: 'AGENT_MESSAGE',
      description: 'Agent issued amenity voucher',
    };
  }

  if (lower.includes('delayed due to') || lower.includes('new departure') || lower.includes('estimated departure')) {
    return {
      eventType: 'DELAY_STATUS_PROVIDED',
      confidence: 0.9,
      evidenceType: 'AGENT_MESSAGE',
      description: 'Agent provided flight delay details',
    };
  }

  if (lower.includes('apologize') || lower.includes('sorry for the inconvenience') || lower.includes('assist you')) {
    return {
      eventType: 'AGENT_ACKNOWLEDGED',
      confidence: 0.8,
      evidenceType: 'AGENT_MESSAGE',
      description: 'Agent acknowledged disruption politely',
    };
  }

  return {
    eventType: 'CLARIFICATION_PROVIDED',
    confidence: 0.6,
    evidenceType: 'AGENT_MESSAGE',
    description: 'General agent response',
  };
};

/**
 * Validates whether an event carries sufficient authoritative evidence.
 * Sensitive events MUST come from CRM webhooks or direct backend confirmations,
 * not pure natural-language claims.
 */
export const validateAuthoritativeEvidence = ({ eventType, evidenceType, evidenceReference }) => {
  const sensitiveEvents = [
    'BOOKING_IDENTIFIED',
    'REFUND_PROCESSED',
    'CHAT_TRANSFERRED',
    'CHAT_ESCALATED',
    'CHAT_CLOSED',
  ];

  if (!sensitiveEvents.includes(eventType)) {
    return { valid: true };
  }

  const validEvidenceSources = ['CRM_RECORD', 'CRM_WEBHOOK'];
  if (!validEvidenceSources.includes(evidenceType)) {
    return {
      valid: false,
      reason: `Sensitive event '${eventType}' requires CRM_RECORD or CRM_WEBHOOK evidence, but received '${evidenceType}'`,
    };
  }

  return { valid: true, evidenceReference };
};

export default {
  interpretAgentMessage,
  validateAuthoritativeEvidence,
};
