/**
 * Post-Chat Quality Control (QC) Evaluation Service
 *
 * Implements two-tier scorecard auditing:
 *  - Tier L1: Agent Performance
 *  - Tier L2: TL / QA (Escalation & Process Compliance)
 *
 * Parameters & Deductions:
 *  - Critical Errors (-55%):
 *      INCOMPLETE_RESOLUTION, INCORRECT_INFORMATION, INCOMPLETE_TROUBLESHOOTING
 *  - Misleading Information (-20%):
 *      MISLEADING_INFORMATION
 *  - Process Compliance (-10%):
 *      WRONG_IDENTIFICATION, ALIAS_VIOLATION, ESCALATION_DELAY,
 *      IN_PROGRESS, IN_QUEUE, POOR_INTERACTION_HANDLING, CUSTOMER_NAME_ERROR
 *  - Communication Quality (-5%):
 *      GRAMMATICAL, GREETING_ERROR, CLOSING_ERROR
 *  - Timeliness & Efficiency (-5%):
 *      ART (Average Response Time), AHT (Average Handling Time)
 */

import { z } from 'zod';
import Conversation from '../models/Conversation.model.js';
import ConversationMessage from '../models/ConversationMessage.model.js';
import QcReport from '../models/QcReport.model.js';
import GeminiProvider from '../ai/providers/gemini.provider.js';
import logger from '../utils/logger.js';

export const QC_PARAMETERS = {
  // Critical Errors (-55%)
  INCOMPLETE_RESOLUTION: {
    category: 'CRITICAL',
    deduction: 55,
    description: 'Agent failed to resolve the core inquiry or closed the interaction prematurely without resolution.',
    applicableTo: ['L1', 'L2'],
  },
  INCORRECT_INFORMATION: {
    category: 'CRITICAL',
    deduction: 55,
    description: 'Provided incorrect flight details, airline policy, baggage limits, or refund calculations.',
    applicableTo: ['L1', 'L2'],
  },
  INCOMPLETE_TROUBLESHOOTING: {
    category: 'CRITICAL',
    deduction: 55,
    description: 'Skipped standard investigation, booking verification, or policy validation procedures.',
    applicableTo: ['L1', 'L2'],
  },

  // Misleading Information (-20%)
  MISLEADING_INFORMATION: {
    category: 'MISLEADING',
    deduction: 20,
    description: 'Made unverified promises, false guarantees, or deceptive timelines (e.g. guaranteeing refund without record).',
    applicableTo: ['L1', 'L2'],
  },

  // Process Compliance (-10%)
  WRONG_IDENTIFICATION: {
    category: 'PROCESS_COMPLIANCE',
    deduction: 10,
    description: 'Failed to verify PNR/identity or matched against incorrect customer/itinerary.',
    applicableTo: ['L1'],
  },
  ALIAS_VIOLATION: {
    category: 'PROCESS_COMPLIANCE',
    deduction: 10,
    description: 'Failed to identify as airline representative or violated identity disclosure protocol.',
    applicableTo: ['L1', 'L2'],
  },
  ESCALATION_DELAY: {
    category: 'PROCESS_COMPLIANCE',
    deduction: 10,
    description: 'Delayed transferring an escalation-eligible query or ignored passenger request to speak to supervisor.',
    applicableTo: ['L1', 'L2'],
  },
  IN_PROGRESS: {
    category: 'PROCESS_COMPLIANCE',
    deduction: 10,
    description: 'Interaction left hanging in progress without next steps, ticket status, or SLA defined.',
    applicableTo: ['L1', 'L2'],
  },
  IN_QUEUE: {
    category: 'PROCESS_COMPLIANCE',
    deduction: 10,
    description: 'Excessive silence while customer in queue or failure to acknowledge passenger arrival promptly.',
    applicableTo: ['L1', 'L2'],
  },
  POOR_INTERACTION_HANDLING: {
    category: 'PROCESS_COMPLIANCE',
    deduction: 10,
    description: 'Rude, dismissive, robotic, sarcastic, or abusive language (e.g., profanity, telling customer to go away).',
    applicableTo: ['L1', 'L2'],
  },
  CUSTOMER_NAME_ERROR: {
    category: 'PROCESS_COMPLIANCE',
    deduction: 10,
    description: 'Misspelled passenger name, called passenger by wrong name, or failed to address appropriately.',
    applicableTo: ['L1'],
  },

  // Communication Quality (-5%)
  GRAMMATICAL: {
    category: 'COMMUNICATION_QUALITY',
    deduction: 5,
    description: 'Severe grammar mistakes, broken sentences, or glaring typos in agent messages.',
    applicableTo: ['L1', 'L2'],
  },
  GREETING_ERROR: {
    category: 'COMMUNICATION_QUALITY',
    deduction: 5,
    description: 'Missing, unprofessional, or robotic greeting at start of interaction.',
    applicableTo: ['L1', 'L2'],
  },
  CLOSING_ERROR: {
    category: 'COMMUNICATION_QUALITY',
    deduction: 5,
    description: 'Missing professional closing remarks, sign-off, or satisfaction check before ending chat.',
    applicableTo: ['L1', 'L2'],
  },

  // Metric-based (-5%)
  ART: {
    category: 'TIMELINESS',
    deduction: 5,
    description: 'Average Response Time (ART) exceeded threshold (> 60s average latency).',
    applicableTo: ['L1', 'L2'],
  },
  AHT: {
    category: 'EFFICIENCY',
    deduction: 5,
    description: 'Average Handling Time (AHT) exceeded threshold (> 4 minutes total chat or idle ceiling reached).',
    applicableTo: ['L1', 'L2'],
  },
};

/**
 * Calculates quantitative timing metrics (ART and AHT) from message timestamps
 */
export const calculateConversationMetrics = (messages = [], conversation = {}) => {
  let totalResponseTimeMs = 0;
  let responseCount = 0;
  let maxSingleResponseTimeMs = 0;

  for (let i = 1; i < messages.length; i++) {
    const prev = messages[i - 1];
    const curr = messages[i];

    // Response time: time elapsed between customer message and subsequent agent response
    if (prev.senderType === 'CUSTOMER' && curr.senderType === 'AGENT') {
      const prevTime = new Date(prev.createdAt || prev.timestamp || 0).getTime();
      const currTime = new Date(curr.createdAt || curr.timestamp || 0).getTime();
      const diffMs = Math.max(0, currTime - prevTime);

      if (diffMs > 0 && diffMs < 30 * 60 * 1000) {
        totalResponseTimeMs += diffMs;
        responseCount++;
        if (diffMs > maxSingleResponseTimeMs) {
          maxSingleResponseTimeMs = diffMs;
        }
      }
    }
  }

  const artSeconds = responseCount > 0 ? Math.round(totalResponseTimeMs / responseCount / 1000) : 0;

  // AHT calculation
  const startTime = new Date(conversation.startedAt || messages[0]?.createdAt || Date.now()).getTime();
  const endTime = new Date(conversation.endedAt || messages[messages.length - 1]?.createdAt || Date.now()).getTime();
  const ahtSeconds = Math.max(0, Math.round((endTime - startTime) / 1000));

  // Thresholds: ART > 60s, AHT > 240s (4 mins)
  const artExceeded = artSeconds > 60 || maxSingleResponseTimeMs > 120 * 1000;
  const ahtExceeded = ahtSeconds > 240;

  return {
    artSeconds,
    artExceeded,
    ahtSeconds,
    ahtExceeded,
    messageCount: messages.length,
    agentMessageCount: messages.filter((m) => m.senderType === 'AGENT').length,
  };
};

/**
 * Deterministic rule-based evaluation to guarantee baseline detection
 * even if LLM is unavailable or rate-limited.
 */
export const runDeterministicQcChecks = ({ messages = [], conversation = {}, metrics = {} }) => {
  const l1Violations = [];
  const l2Violations = [];

  const agentMessages = messages.filter((m) => m.senderType === 'AGENT');
  const customerMessages = messages.filter((m) => m.senderType === 'CUSTOMER');
  const fixtureFacts = conversation.customerFixture?.facts || {};
  const passengerName = (fixtureFacts.passengerName || '').toLowerCase();

  const allAgentText = agentMessages.map((m) => m.content || '').join(' ');
  const lowerAgentText = allAgentText.toLowerCase();

  // 1. POOR_INTERACTION_HANDLING (-10%)
  const profanityOrRude = [
    /\bfuck\b/i,
    /\bshit\b/i,
    /\bidiot\b/i,
    /\bstupid\b/i,
    /\bshut\s*up\b/i,
    /\bget\s*lost\b/i,
    /\bnot\s*my\s*problem\b/i,
    /\bdon'?t\s*care\b/i,
  ];
  const rudeMatch = profanityOrRude.find((rx) => rx.test(allAgentText));
  if (rudeMatch) {
    l1Violations.push({
      code: 'POOR_INTERACTION_HANDLING',
      category: 'PROCESS_COMPLIANCE',
      deduction: 10,
      reason: 'Agent used inappropriate, dismissive, or offensive language.',
      evidence: `Detected pattern matching: ${rudeMatch}`,
    });
  }

  // 2. GREETING_ERROR (-5%)
  if (agentMessages.length > 0) {
    const firstAgentMsg = (agentMessages[0].content || '').toLowerCase();
    const hasGreeting =
      firstAgentMsg.includes('hello') ||
      firstAgentMsg.includes('hi ') ||
      firstAgentMsg.startsWith('hi') ||
      firstAgentMsg.includes('welcome') ||
      firstAgentMsg.includes('good morning') ||
      firstAgentMsg.includes('good afternoon') ||
      firstAgentMsg.includes('good evening') ||
      firstAgentMsg.includes('thank you for contacting') ||
      firstAgentMsg.includes('skywings');

    if (!hasGreeting && firstAgentMsg.length > 0) {
      l1Violations.push({
        code: 'GREETING_ERROR',
        category: 'COMMUNICATION_QUALITY',
        deduction: 5,
        reason: 'First agent response lacks a professional greeting or airline introduction.',
        evidence: `First message: "${agentMessages[0].content?.substring(0, 60)}..."`,
      });
    }
  }

  // 3. CLOSING_ERROR (-5%)
  if (conversation.status === 'COMPLETED' || conversation.status === 'RESOLVED') {
    const lastAgentMsg = agentMessages.length > 0 ? (agentMessages[agentMessages.length - 1].content || '').toLowerCase() : '';
    const hasClosing =
      lastAgentMsg.includes('have a great day') ||
      lastAgentMsg.includes('have a nice day') ||
      lastAgentMsg.includes('thank you for choosing') ||
      lastAgentMsg.includes('thank you for contacting') ||
      lastAgentMsg.includes('fly skywings') ||
      lastAgentMsg.includes('anything else') ||
      lastAgentMsg.includes('take care') ||
      lastAgentMsg.includes('goodbye') ||
      lastAgentMsg.includes('bye');

    if (!hasClosing && agentMessages.length >= 3) {
      l1Violations.push({
        code: 'CLOSING_ERROR',
        category: 'COMMUNICATION_QUALITY',
        deduction: 5,
        reason: 'Interaction closed without a standard closing greeting or satisfaction check.',
        evidence: lastAgentMsg ? `Last agent message: "${lastAgentMsg.substring(0, 60)}..."` : 'No closing message',
      });
    }
  }

  // 4. CUSTOMER_NAME_ERROR (-10%)
  if (passengerName && passengerName.length > 3) {
    const nameParts = passengerName.split(' ');
    const lastName = nameParts[nameParts.length - 1];
    // Check if agent addressed passenger with a completely different name (e.g. Mr. Wrong)
    const addressedNameMatch = allAgentText.match(/\b(?:mr|ms|mrs|dear|hello|hi)\s+([A-Z][a-z]+)\b/i);
    if (addressedNameMatch && addressedNameMatch[1]) {
      const addressed = addressedNameMatch[1].toLowerCase();
      const isCorrect = nameParts.some((part) => part.toLowerCase() === addressed);
      if (!isCorrect && !['there', 'customer', 'passenger', 'traveler'].includes(addressed)) {
        l1Violations.push({
          code: 'CUSTOMER_NAME_ERROR',
          category: 'PROCESS_COMPLIANCE',
          deduction: 10,
          reason: `Agent addressed customer as '${addressedNameMatch[1]}' instead of '${fixtureFacts.passengerName}'.`,
          evidence: `Addressed as: ${addressedNameMatch[0]}`,
        });
      }
    }
  }

  // 5. ESCALATION_DELAY (-10%)
  const customerRequestedEscalation = customerMessages.some((m) =>
    /\b(supervisor|manager|team lead|escalat)\b/i.test(m.content || ''),
  );
  if (customerRequestedEscalation) {
    const agentEscalated = agentMessages.some((m) =>
      /\b(transfer|escalat|supervisor|team lead|floor lead)\b/i.test(m.content || ''),
    );
    if (!agentEscalated) {
      l1Violations.push({
        code: 'ESCALATION_DELAY',
        category: 'PROCESS_COMPLIANCE',
        deduction: 10,
        reason: 'Customer requested escalation, but frontline agent failed to transfer or initiate escalation.',
        evidence: 'Customer requested supervisor/escalation with no escalation transfer executed.',
      });
      l2Violations.push({
        code: 'ESCALATION_DELAY',
        category: 'PROCESS_COMPLIANCE',
        deduction: 10,
        reason: 'Supervisory tier did not acknowledge or intercept unresolved escalation request.',
        evidence: 'Escalation queue unattended.',
      });
    }
  }

  // 6. INCOMPLETE_RESOLUTION (-55%)
  if (conversation.endReason === 'ABANDONED' || conversation.status === 'ABANDONED') {
    l1Violations.push({
      code: 'INCOMPLETE_RESOLUTION',
      category: 'CRITICAL',
      deduction: 55,
      reason: 'Conversation was abandoned without resolving passenger request.',
      evidence: `End reason: ${conversation.endReason || conversation.status}`,
    });
    l2Violations.push({
      code: 'INCOMPLETE_RESOLUTION',
      category: 'CRITICAL',
      deduction: 55,
      reason: 'Case abandoned prior to resolution.',
      evidence: 'Unresolved session timeout',
    });
  }

  // 7. ART penalty (-5%)
  if (metrics.artExceeded) {
    l1Violations.push({
      code: 'ART',
      category: 'TIMELINESS',
      deduction: 5,
      reason: `Average Response Time exceeded SLA standard (${metrics.artSeconds}s).`,
      evidence: `Average response latency: ${metrics.artSeconds}s`,
    });
  }

  // 8. AHT penalty (-5%)
  if (metrics.ahtExceeded) {
    l1Violations.push({
      code: 'AHT',
      category: 'EFFICIENCY',
      deduction: 5,
      reason: `Average Handling Time exceeded 4-minute ceiling (${metrics.ahtSeconds}s).`,
      evidence: `Total conversation duration: ${metrics.ahtSeconds}s`,
    });
  }

  return { l1Violations, l2Violations };
};

/**
 * Builds Gemini evaluation prompt for deep semantic QC audit
 */
const buildQcEvaluationPrompt = ({ messages, conversation, metrics }) => {
  const transcriptLines = messages.map(
    (m) => `[${m.senderType} - ${m.senderId || m.senderType}]: ${m.content}`,
  );

  const fixtureFacts = conversation.customerFixture?.facts || {};

  return `You are a Senior Airline Customer Support Quality Assurance (QA) Auditor.
Audit the following live customer-agent chat transcript for compliance with airline Quality Control (QC) standards.

Evaluate TWO levels:
1. Agent (L1) - Frontline agent conduct, accuracy, politeness, and troubleshooting.
2. TL/QA (L2) - Process compliance, supervisory handover, escalation handling, and queue resolution.

=== FLIGHT & BOOKING FACTS (GROUND TRUTH) ===
Passenger Name: ${fixtureFacts.passengerName || 'Unknown'}
PNR: ${fixtureFacts.pnr || 'Unknown'}
Flight: ${fixtureFacts.flightNumber || 'Unknown'}
Route: ${fixtureFacts.route || 'Unknown'}
Travel Date: ${fixtureFacts.travelDate || 'Unknown'}
Booking Status: ${fixtureFacts.bookingStatus || 'Unknown'}
Ticket Amount: ${fixtureFacts.ticketAmount || 'Unknown'}
Primary Stated Issue: ${fixtureFacts.primaryIssue || 'Unspecified'}

=== CONVERSATION TRANSCRIPT ===
${transcriptLines.join('\n')}

=== QC EVALUATION RUBRIC ===
Identify any of the following violations that occurred in the chat:
- INCOMPLETE_RESOLUTION (-55%): Ended without resolving core problem.
- INCORRECT_INFORMATION (-55%): Stated false policy, wrong fee, wrong flight or booking status.
- INCOMPLETE_TROUBLESHOOTING (-55%): Failed to investigate, verify details, or follow trouble steps.
- MISLEADING_INFORMATION (-20%): Promised unverified outcome, fabricated guarantee, or false timeline.
- WRONG_IDENTIFICATION (-10%): Verified wrong details or failed authentication.
- ALIAS_VIOLATION (-10%): Failed airline representative persona standards.
- ESCALATION_DELAY (-10%): Resisted or delayed requested supervisor transfer.
- IN_PROGRESS (-10%): Stalled ticket without next steps or resolution timeframe.
- IN_QUEUE (-10%): Unreasonable idle delay or lack of greeting in queue.
- POOR_INTERACTION_HANDLING (-10%): Rude, sarcastic, abusive, dismissive, or robotic language.
- CUSTOMER_NAME_ERROR (-10%): Addressed customer by incorrect name.
- GRAMMATICAL (-5%): Egregious grammar errors or unreadable phrasing.
- GREETING_ERROR (-5%): Missing or improper greeting.
- CLOSING_ERROR (-5%): Missing professional closing sign-off.

Respond with strict JSON only adhering to this structure:
{
  "l1Violations": [
    {
      "code": "POOR_INTERACTION_HANDLING",
      "category": "PROCESS_COMPLIANCE",
      "deduction": 10,
      "reason": "Agent used rude language.",
      "evidence": "Quote from transcript"
    }
  ],
  "l2Violations": [],
  "l1Feedback": "Summary feedback for agent",
  "l2Feedback": "Summary feedback for TL/QA"
}`;
};

/**
 * Runs complete Quality Control (QC) evaluation for a completed conversation
 */
export const evaluateQc = async ({ conversationId, reason = 'COMPLETED' }) => {
  try {
    const conversation = await Conversation.findById(conversationId)
      .populate('persona')
      .populate('scenario')
      .lean();

    if (!conversation) {
      logger.warn(`[QC] Conversation not found: ${conversationId}`);
      return null;
    }

    const messages = await ConversationMessage.find({ conversation: conversation._id })
      .sort({ sequenceNumber: 1 })
      .lean();

    const metrics = calculateConversationMetrics(messages, conversation);

    // Step 1: Run deterministic checks
    const { l1Violations: detL1, l2Violations: detL2 } = runDeterministicQcChecks({
      messages,
      conversation,
      metrics,
    });

    let llmL1Violations = [];
    let llmL2Violations = [];
    let l1Feedback = '';
    let l2Feedback = '';

    // Step 2: Run Gemini LLM semantic audit if messages exist
    if (messages.length >= 2) {
      try {
        const llmProvider = new GeminiProvider();
        const prompt = buildQcEvaluationPrompt({ messages, conversation, metrics });

        const rawResult = await llmProvider.generate({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        });

        const textOutput = rawResult?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const parsed = JSON.parse(textOutput);

        if (Array.isArray(parsed.l1Violations)) {
          llmL1Violations = parsed.l1Violations.filter((v) => QC_PARAMETERS[v.code]);
        }
        if (Array.isArray(parsed.l2Violations)) {
          llmL2Violations = parsed.l2Violations.filter((v) => QC_PARAMETERS[v.code]);
        }
        l1Feedback = parsed.l1Feedback || '';
        l2Feedback = parsed.l2Feedback || '';
      } catch (llmErr) {
        logger.warn(`[QC] LLM audit failed or throttled, relying on deterministic QC: ${llmErr.message}`);
      }
    }

    // Merge violations uniquely by code
    const mergeViolations = (detList, llmList) => {
      const map = new Map();
      for (const v of detList) {
        map.set(v.code, v);
      }
      for (const v of llmList) {
        if (!map.has(v.code) && QC_PARAMETERS[v.code]) {
          const param = QC_PARAMETERS[v.code];
          map.set(v.code, {
            code: v.code,
            category: param.category,
            deduction: param.deduction,
            reason: v.reason || param.description,
            evidence: v.evidence || '',
          });
        }
      }
      return Array.from(map.values());
    };

    const finalL1Violations = mergeViolations(detL1, llmL1Violations);
    const finalL2Violations = mergeViolations(detL2, llmL2Violations);

    // Calculate deductions & scores
    const calcTier = (tier, label, violations, feedback) => {
      const totalDeductions = violations.reduce((acc, v) => acc + (v.deduction || 0), 0);
      const score = Math.max(0, 100 - totalDeductions);
      const hasCriticalError = violations.some((v) => v.category === 'CRITICAL');
      const passed = !hasCriticalError && score >= 80;

      return {
        tier,
        label,
        score,
        passed,
        hasCriticalError,
        violations,
        totalDeductions,
        feedback: feedback || (passed ? 'Compliant with standard operating procedures.' : 'Action items identified during audit.'),
        metrics,
      };
    };

    const l1Result = calcTier('L1', 'Agent (L1)', finalL1Violations, l1Feedback);
    const l2Result = calcTier('L2', 'TL/QA (L2)', finalL2Violations, l2Feedback);

    const overallScore = Math.round((l1Result.score * 0.6) + (l2Result.score * 0.4));
    const anyCritical = l1Result.hasCriticalError || l2Result.hasCriticalError;
    const status = anyCritical ? 'CRITICAL_FAIL' : overallScore >= 80 ? 'PASS' : 'FAIL';

    const criticalErrorsCount =
      finalL1Violations.filter((v) => v.category === 'CRITICAL').length +
      finalL2Violations.filter((v) => v.category === 'CRITICAL').length;

    // Create or update QC report document in MongoDB
    const reportData = {
      conversation: conversation._id,
      conversationId: conversation.conversationId,
      pnr: conversation.customerFixture?.facts?.pnr || '',
      customerName: conversation.customerFixture?.facts?.passengerName || '',
      agentName: 'Frontline Agent',
      status,
      overallScore,
      l1Agent: l1Result,
      l2TlQa: l2Result,
      criticalErrorsCount,
      evaluatedAt: new Date(),
    };

    const savedReport = await QcReport.findOneAndUpdate(
      { conversation: conversation._id },
      reportData,
      { upsert: true, new: true },
    );

    // Also persist inside conversation outcome for convenience
    await Conversation.findByIdAndUpdate(conversation._id, {
      $set: {
        'outcome.qcReport': {
          reportId: savedReport._id,
          overallScore,
          status,
          l1Score: l1Result.score,
          l2Score: l2Result.score,
          hasCriticalError: anyCritical,
          evaluatedAt: savedReport.evaluatedAt,
        },
      },
    });

    logger.info(
      `[QC] Evaluation completed for ${conversation.conversationId}: Status=${status}, Score=${overallScore}% (L1=${l1Result.score}%, L2=${l2Result.score}%)`,
    );

    return savedReport;
  } catch (err) {
    logger.error(`[QC] Failed to evaluate conversation ${conversationId}: ${err.message}`);
    return null;
  }
};

export default {
  QC_PARAMETERS,
  calculateConversationMetrics,
  runDeterministicQcChecks,
  evaluateQc,
};
