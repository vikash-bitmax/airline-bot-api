/**
 * Event Interpreter Service
 * Classifies agent messages into semantic events and enforces
 * authoritative evidence rules for sensitive CRM transitions.
 */

export const interpretAgentMessage = (text) => {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase();

  // Pattern detection for agent requests and explanations
  if (
    lower.includes('pnr') || lower.includes('booking reference') || lower.includes('booking code') ||
    lower.includes('ticket number') || lower.includes('your details') || lower.includes('your information') ||
    lower.includes('booking details') || lower.includes('flight details') || lower.includes('passenger details') ||
    lower.includes('confirmation number') || lower.includes('reservation') ||
    (lower.includes('details') && (lower.includes('provide') || lower.includes('share') || lower.includes('get') || lower.includes('give') || lower.includes('need') || lower.includes('can i'))) ||
    (lower.includes('verify') && (lower.includes('identity') || lower.includes('booking') || lower.includes('name')))
  ) {
    return {
      eventType: 'AGENT_ASKED_FOR_PNR',
      confidence: 0.92,
      evidenceType: 'AGENT_MESSAGE',
      description: 'Agent requested passenger/booking details',
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

  if (
    lower.includes('escalat') || lower.includes('escalta') || lower.includes('transfer') ||
    lower.includes('supervisor') || lower.includes('team lead') || lower.includes('floor lead') ||
    lower.includes('manager') || lower.includes('passing this to') || lower.includes('handing over')
  ) {
    return {
      eventType: 'AGENT_INITIATED_ESCALATION',
      confidence: 0.95,
      evidenceType: 'AGENT_MESSAGE',
      description: 'Agent initiated escalation or transfer to supervisor/lead',
    };
  }

  if (
    lower.includes('got it') || lower.includes('i got it') || lower.includes('found it') ||
    lower.includes('found your booking') || lower.includes('located your booking') ||
    lower.includes('pulling up') || lower.includes('pulled up') || lower.includes('i see your') ||
    lower.includes('let me check') || lower.includes('checking this') || lower.includes('one moment') ||
    lower.includes('give me a moment') || lower.includes('looking into this')
  ) {
    return {
      eventType: 'BOOKING_IDENTIFIED',
      confidence: 0.9,
      evidenceType: 'AGENT_MESSAGE',
      description: 'Agent located or acknowledged passenger booking details',
    };
  }

  if (
    lower.includes('apologize') || lower.includes('sorry') || lower.includes('assist you') ||
    lower.includes('how can i help') || lower.includes('how may i help') ||
    lower.includes('hello') || lower.includes('hi there') || lower.includes('welcome') ||
    lower.includes('thanks for reaching') || lower.includes('thank you for contacting')
  ) {
    return {
      eventType: 'AGENT_ACKNOWLEDGED',
      confidence: 0.85,
      evidenceType: 'AGENT_MESSAGE',
      description: 'Agent acknowledged disruption or greeted passenger',
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
