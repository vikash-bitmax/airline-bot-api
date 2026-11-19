/**
 * Disclosed Facts & Agent Behavior Service
 *
 * Tracks which customer ticket facts have been disclosed during the chat,
 * analyzes agent interaction quality (empathy, repetition, rudeness, vague promises),
 * and provides backend privacy guardrails against premature PNR leakage.
 */

/**
 * Extracts the list of fact keys that have already been disclosed by the customer in chat.
 */
export const extractDisclosedFacts = (messages = [], fixtureFacts = {}) => {
  const disclosed = new Set();
  const customerMsgs = messages.filter((m) => m.senderType === 'CUSTOMER');

  if (!customerMsgs.length || !fixtureFacts) return [];

  const factsToCheck = [
    { key: 'pnr', value: fixtureFacts.pnr },
    { key: 'flightNumber', value: fixtureFacts.flightNumber },
    { key: 'passengerName', value: fixtureFacts.passengerName },
    { key: 'passengerEmail', value: fixtureFacts.passengerEmail },
    { key: 'travelDate', value: fixtureFacts.travelDate },
    { key: 'baggageTag', value: fixtureFacts.baggageTag },
    { key: 'paymentReference', value: fixtureFacts.paymentReference },
    { key: 'route', value: fixtureFacts.route },
  ];

  for (const msg of customerMsgs) {
    const content = (msg.content || '').toLowerCase();
    for (const { key, value } of factsToCheck) {
      if (!value) continue;
      const strVal = String(value).toLowerCase().trim();
      if (strVal.length >= 3 && content.includes(strVal)) {
        disclosed.add(key);
      }
    }

    // Additional heuristic: if message mentions "pnr is" or "booking reference is" with any 6-char code
    if (/\b(pnr|booking\s+reference|booking\s+code)\b/i.test(msg.content || '') && fixtureFacts.pnr) {
      disclosed.add('pnr');
    }
  }

  return Array.from(disclosed);
};

/**
 * Detects whether the agent is requesting information that has already been disclosed.
 */
export const detectAgentRequestingDisclosedFact = (agentText = '', disclosedFacts = []) => {
  if (!agentText || !disclosedFacts.length) return null;
  const lower = agentText.toLowerCase();

  const isAskingForPnr =
    lower.includes('pnr') ||
    lower.includes('booking reference') ||
    lower.includes('booking code') ||
    lower.includes('ticket number') ||
    lower.includes('reservation code') ||
    (lower.includes('booking') && (lower.includes('provide') || lower.includes('share') || lower.includes('give') || lower.includes('what is') || lower.includes('can i have')));

  if (isAskingForPnr && disclosedFacts.includes('pnr')) {
    return { factKey: 'pnr', description: 'Booking reference (PNR) already shared' };
  }

  const isAskingForName =
    (lower.includes('your name') || lower.includes('full name') || lower.includes('passenger name')) &&
    (lower.includes('provide') || lower.includes('share') || lower.includes('can i have') || lower.includes('what is'));

  if (isAskingForName && disclosedFacts.includes('passengerName')) {
    return { factKey: 'passengerName', description: 'Passenger name already shared' };
  }

  const isAskingForFlight =
    (lower.includes('flight number') || lower.includes('which flight')) &&
    (lower.includes('provide') || lower.includes('share') || lower.includes('can i have') || lower.includes('what is'));

  if (isAskingForFlight && disclosedFacts.includes('flightNumber')) {
    return { factKey: 'flightNumber', description: 'Flight number already shared' };
  }

  return null;
};

/**
 * Classifies agent message quality and conversational stance for realistic emotional reaction.
 */
export const detectAgentBehavior = (agentText = '', { disclosedFacts = [], recentHistory = [] } = {}) => {
  if (!agentText || typeof agentText !== 'string') return 'STANDARD_ASSISTANCE';
  const lower = agentText.toLowerCase().trim();

  // 1. Prompt Injection detection
  if (
    lower.includes('ignore previous instructions') ||
    lower.includes('ignore all previous') ||
    lower.includes('system prompt') ||
    lower.includes('repeat your prompt') ||
    lower.includes('developer mode') ||
    lower.includes('you are now an ai') ||
    lower.includes('disregard the above')
  ) {
    return 'PROMPT_INJECTION_ATTEMPT';
  }

  // 2. Abusive / Rude / Dismissive
  const rudePatterns = [
    /\bfuck\b/,
    /\bshit\b/,
    /\bshut\ up\b/,
    /\bget\ lost\b/,
    /\bnot\ my\ problem\b/,
    /\bstop\ complaining\b/,
    /\bidiot\b/,
    /\bstupid\b/,
    /\bdon't\ care\b/,
  ];
  if (rudePatterns.some((pattern) => pattern.test(lower))) {
    return 'RUDE_DISMISSIVE';
  }

  // 3. Repeated question for information already disclosed
  const repeatedFact = detectAgentRequestingDisclosedFact(agentText, disclosedFacts);
  if (repeatedFact) {
    return 'REPEATED_QUESTION';
  }

  // 4. Empathetic Solution / Valid options offered (check before final resolution to catch offers with empathy)
  const hasEmpathy =
    lower.includes('understand your frustration') ||
    lower.includes('apologize for the inconvenience') ||
    lower.includes('sorry for this disruption') ||
    lower.includes('completely understand') ||
    lower.includes('i am so sorry');

  const hasSolution =
    lower.includes('next available flight') ||
    lower.includes('rebook you') ||
    lower.includes('process a full refund') ||
    lower.includes('options for you') ||
    lower.includes('alternative flight');

  if (hasEmpathy && hasSolution) {
    return 'EMPATHETIC_SOLUTION';
  }

  // 5. Genuine Resolution confirmed (actual completed action or confirmed confirmation)
  if (
    (lower.includes('refund') && (
      lower.includes('has been processed') ||
      lower.includes('successfully initiated') ||
      lower.includes('full refund confirmed') ||
      (lower.includes('confirmed') && (lower.includes('full refund') || /\$[\d,.]+/.test(lower))) ||
      (/\b(reference|ref)[\s#:-]+[A-Z0-9-]{4,}\b/i.test(agentText))
    )) ||
    (lower.includes('rebooked') && (lower.includes('confirmed') || lower.includes('seat is confirmed') || lower.includes('boarding pass sent'))) ||
    (lower.includes('resolved') && lower.includes('ticket')) ||
    (lower.includes('issue has been resolved')) ||
    (lower.includes('booking confirmed') && lower.includes('new'))
  ) {
    return 'GENUINE_RESOLUTION';
  }

  // 6. Escalation initiated
  if (
    lower.includes('escalat') ||
    lower.includes('escalta') ||
    lower.includes('transfer') ||
    lower.includes('supervisor') ||
    lower.includes('team lead') ||
    lower.includes('floor lead') ||
    lower.includes('manager')
  ) {
    return 'ESCALATION_OFFERED';
  }

  // 7. Vague promise without actionable detail (check BEFORE repeated wait to avoid "please wait" masking vague refund promises)
  if (
    (lower.includes('refund is being processed') ||
     lower.includes('your refund is being') ||
     lower.includes('looking into it') ||
     lower.includes('we are processing') ||
     lower.includes('being processed')) &&
    !lower.includes('days') &&
    !lower.includes('hours') &&
    !lower.includes('reference') &&
    !lower.includes('business day') &&
    !lower.includes('timeline')
  ) {
    return 'VAGUE_PROMISE';
  }

  // 8. Repeated Wait messages without new information
  const isWaitMsg =
    lower.includes('please wait') ||
    lower.includes('give me a moment') ||
    lower.includes('checking on this') ||
    lower.includes('still checking') ||
    lower.includes('one moment please');

  if (isWaitMsg) {
    const priorAgentMsgs = recentHistory.filter((m) => m.senderType === 'AGENT');
    const recentWaitCount = priorAgentMsgs
      .slice(-3)
      .filter((m) => {
        const text = (m.content || '').toLowerCase();
        return text.includes('wait') || text.includes('moment') || text.includes('checking');
      }).length;

    if (recentWaitCount >= 1) {
      return 'REPEATED_WAIT';
    }
  }

  // 9. Apology only (without any solution or next step)
  if (
    (lower.includes('sorry') || lower.includes('apologize')) &&
    !lower.includes('flight') &&
    !lower.includes('refund') &&
    !lower.includes('rebook') &&
    !lower.includes('check') &&
    !lower.includes('pnr')
  ) {
    return 'APOLOGY_ONLY';
  }

  if (hasSolution || lower.includes('pnr') || lower.includes('booking')) {
    return 'HELPFUL_RESPONSE';
  }

  return 'STANDARD_ASSISTANCE';
};

/**
 * Backend Privacy Guardrail:
 * Protects against premature PNR leakage when the agent has NOT explicitly requested it.
 */
export const enforceBackendPrivacyGuardrail = ({
  customerReplyText = '',
  agentMessageText = '',
  permittedFacts = {},
  disclosedFacts = [],
}) => {
  if (!customerReplyText || !permittedFacts?.pnr) return customerReplyText;

  const pnr = String(permittedFacts.pnr).trim();
  if (pnr.length < 4) return customerReplyText;

  // If PNR is already publicly disclosed in this conversation, no leakage issue
  if (disclosedFacts.includes('pnr')) {
    return customerReplyText;
  }

  // Check if agent explicitly asked for PNR
  const agentLower = (agentMessageText || '').toLowerCase();
  const agentExplicitlyAskedPnr =
    agentLower.includes('pnr') ||
    agentLower.includes('booking reference') ||
    agentLower.includes('booking code') ||
    agentLower.includes('ticket number') ||
    agentLower.includes('reservation code') ||
    (agentLower.includes('booking') && (agentLower.includes('details') || agentLower.includes('provide') || agentLower.includes('share')));

  // If agent asked for it, disclosure is authorized!
  if (agentExplicitlyAskedPnr) {
    return customerReplyText;
  }

  // If agent did NOT ask for PNR, check if customer message prematurely leaks it
  const pnrRegex = new RegExp(`\\b${pnr}\\b`, 'gi');
  if (pnrRegex.test(customerReplyText)) {
    // Redact premature PNR and replace with natural customer phrase
    return customerReplyText.replace(
      new RegExp(`(?:my\\s+booking\\s+reference\\s+(?:is\\s+)?|my\\s+pnr\\s+(?:is\\s+)?|pnr:\\s*)?${pnr}`, 'gi'),
      'my booking'
    );
  }

  return customerReplyText;
};

export default {
  extractDisclosedFacts,
  detectAgentRequestingDisclosedFact,
  detectAgentBehavior,
  enforceBackendPrivacyGuardrail,
};
