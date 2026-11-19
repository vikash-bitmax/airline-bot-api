import { v4 as uuidv4 } from 'uuid';
import Conversation from '../models/Conversation.model.js';
import Persona from '../models/Persona.model.js';
import Scenario from '../models/Scenario.model.js';
import SimulationRun from '../models/SimulationRun.model.js';

import { generateCustomerFixture, generateCustomerFixtureFromDb } from './fixture-generator.service.js';
import {
  initializePersonaState,
  updatePersonaDynamics,
  buildPersonaPromptContext,
} from './persona-engine.service.js';
import {
  initializeScenarioState,
  getPermittedFacts,
  validateAndApplyTransition,
  incrementTurnAndCheckLimits,
} from './scenario-engine.service.js';
import { createMessage, getConversationMessages } from './message.service.js';
import { recordConversationEvent, updateConversationProgress } from './conversation-state.service.js';
import { interpretAgentMessage, validateAuthoritativeEvidence } from './event-interpreter.service.js';
import { calculateHumanTimings, sleep } from './human-typing.service.js';
import { extractDisclosedFacts, detectAgentBehavior } from './disclosed-facts.service.js';
import GeminiProvider from '../ai/providers/gemini.provider.js';
import crmClient from '../integrations/crm/crm-client.js';
import crmSocketClient from '../integrations/crm/crm-socket.client.js';
import mockCrmClient from '../integrations/crm/mock-crm-client.js';
import { evaluateConversation } from './evaluation.service.js';
import { evaluateQc } from './qc-evaluation.service.js';
import logger from '../utils/logger.js';
import { broadcastEvent } from '../../server.js';

export class ConversationOrchestrator {
  constructor() {
    this.llmProvider = new GeminiProvider();
    this.startIdleAhtSweeper();
  }

  /**
   * Periodic background sweeper enforcing the 4-minute AHT silence ceiling.
   * If an active conversation has had no message exchanges for over 4 minutes while customer was waiting,
   * customer ceases replying and conversation concludes as ABANDONED.
   */
  startIdleAhtSweeper() {
    if (this._sweeperInterval) return;
    this._sweeperInterval = setInterval(async () => {
      try {
        const ACTIVE_STATUSES = ['ACTIVE', 'RUNNING', 'WAITING', 'NEW', 'WAITING_FOR_AGENT', 'WAITING_FOR_CUSTOMER'];
        const idleCutoff = new Date(Date.now() - 4 * 60 * 1000); // 4 minutes of total inactivity

        const candidates = await Conversation.find({
          status: { $in: ACTIVE_STATUSES },
          updatedAt: { $lte: idleCutoff },
        });

        for (const conv of candidates) {
          // Check last message in conversation
          const lastMsg = await ConversationMessage.findOne({ conversation: conv._id })
            .sort({ sequenceNumber: -1 })
            .lean();

          // Only abandon if the last message was sent > 4 mins ago by the customer
          // (meaning the customer has been waiting in silence for > 4 minutes with no agent response)
          if (lastMsg?.sentAt && (Date.now() - new Date(lastMsg.sentAt).getTime()) >= 4 * 60 * 1000) {
            logger.warn(`[AHT Sweeper] Conversation ${conv.conversationId} had >4 min silence. Marking ABANDONED.`);
            conv.status = 'ABANDONED';
            conv.endedAt = new Date();
            conv.endReason = 'AHT_TIMEOUT_4MIN: 4 min AHT silence threshold reached - customer stopped replying';
            await conv.save();

            crmSocketClient.disconnectConversation(conv.conversationId);

            broadcastEvent('conversation:updated', {
              conversationId: conv.conversationId,
              status: 'ABANDONED',
              endReason: conv.endReason,
            });
            broadcastEvent('conversation:completed', {
              conversationId: conv.conversationId,
              outcome: { goalAchieved: false, reason: conv.endReason },
            });
          }
        }
      } catch (err) {
        logger.error(`[AHT Sweeper Error]: ${err.message}`);
      }
    }, 30000); // run every 30s
  }

  /**
   * Reconnect CRM sockets for any active conversations on server startup
   */
  async reconnectActiveConversations() {
    try {
      const activeConvs = await Conversation.find({
        status: { $in: ['ACTIVE', 'RUNNING', 'WAITING', 'NEW', 'WAITING_FOR_AGENT', 'WAITING_FOR_CUSTOMER'] },
        'crm.externalConversationId': { $exists: true, $ne: null },
      });
      logger.info(`Reconnecting CRM sockets for ${activeConvs.length} active conversation(s)...`);
      for (const conv of activeConvs) {
        if (conv.crm?.externalConversationId && conv.crm?.customerSessionToken) {
          crmSocketClient.connectForConversation({
            conversationId: conv.conversationId,
            chatId: conv.crm.externalConversationId,
            token: conv.crm.customerSessionToken,
            onAgentMessage: (msg) => {
              this.handleAgentResponse({
                conversationId: conv._id,
                agentMessage: msg.text,
                senderName: msg.senderName,
                crmChatId: conv.crm.externalConversationId,
                crmToken: conv.crm.customerSessionToken,
                useMockCrm: false,
              });
            },
            onCrmEvent: (event) => {
              this.handleCrmStatusEvent({
                conversationId: conv._id,
                conversationPublicId: conv.conversationId,
                crmChatId: conv.crm.externalConversationId,
                event,
              });
            },
          });
        }
      }
    } catch (err) {
      logger.error(`Failed to reconnect active conversations: ${err.message}`);
    }
  }

  async startConversation({
    runId,
    personaId,
    scenarioId,
    randomSeed,
    useMockCrm = false,
    customFixture,
    timingConfig,
  }) {
    logger.info(`Starting conversation: run=${runId}, persona=${personaId}, scenario=${scenarioId}`);

    const [persona, scenario, simulationRun] = await Promise.all([
      Persona.findOne({ personaId }),
      Scenario.findOne({ scenarioId }),
      SimulationRun.findOne({ runId }),
    ]);

    if (!persona) throw new Error(`Persona not found: ${personaId}`);
    if (!scenario) throw new Error(`Scenario not found: ${scenarioId}`);
    if (!simulationRun) throw new Error(`Simulation run not found: ${runId}`);

    const conversationId = `CONV-${uuidv4().substring(0, 8).toUpperCase()}`;

    // 1. Generate fixture from seeded database customer (with deterministic fallback)
    const customerFixture = await generateCustomerFixtureFromDb({
      randomSeed: randomSeed || simulationRun.configuration?.randomSeed || 'default-seed',
      conversationId,
      scenarioRequirements: scenario.requiredFacts,
    });

    if (customFixture) {
      // Prevent persona names or simulation tags from masking real seeded customer identity
      const isPersonaName = customFixture.passengerName && (
        customFixture.passengerName.includes('(Sim)') ||
        customFixture.passengerName.includes('(AutoPilot)') ||
        customFixture.passengerName.toLowerCase() === persona.name?.toLowerCase() ||
        customFixture.passengerName.toLowerCase().includes(persona.name?.toLowerCase())
      );
      if (customFixture.passengerName && !isPersonaName) {
        customerFixture.facts.passengerName = customFixture.passengerName;
      }
      if (customFixture.passengerEmail && !customFixture.passengerEmail.includes('passenger.') && !customFixture.passengerEmail.endsWith('@example.test')) {
        customerFixture.facts.passengerEmail = customFixture.passengerEmail;
      }
      if (customFixture.pnr && customFixture.pnr !== 'SW9941') {
        customerFixture.facts.pnr = customFixture.pnr;
      }
      if (customFixture.flightNumber && customFixture.flightNumber !== 'SW-101') {
        customerFixture.facts.flightNumber = customFixture.flightNumber;
      }
    }

    // 2. Initialise states
    const dynamicPersonaState = initializePersonaState(persona);
    const scenarioState = initializeScenarioState(scenario);

    // 3. Create Conversation doc
    const conversation = await Conversation.create({
      conversationId,
      simulationRun: simulationRun._id,
      persona: persona._id,
      scenario: scenario._id,
      personaSnapshot: persona.toObject(),
      scenarioSnapshot: scenario.toObject(),
      customerFixture,
      status: 'ACTIVE',
      scenarioProgress: {
        currentState: scenarioState.currentState,
        visitedStates: scenarioState.visitedStates,
        turnCount: 0,
      },
      dynamicPersonaState,
      timingConfig: timingConfig || {
        minWaitSec: 120,
        maxWaitSec: 150,
        maxAhtMins: 4,
        idleStopMins: 4,
        pilotMode: 'MANUAL',
      },
      startedAt: new Date(),
    });

    broadcastEvent('conversation:created', { conversation: conversation.toObject() });

    // 4. Generate Opening Customer Message
    const personaContext = buildPersonaPromptContext({ persona, dynamicState: dynamicPersonaState });
    const permittedFacts = getPermittedFacts({
      scenario,
      currentState: scenarioState.currentState,
      fixture: customerFixture,
    });

    let openingText;
    let messageIntent = 'STATE_PROBLEM';
    let emotionExp = persona.emotionalBaseline?.temperament || 'NEUTRAL';
    let aiMeta = null;

    if (customFixture?.initialMessage) {
      openingText = customFixture.initialMessage;
    } else {
      const llmResult = await this.llmProvider.generateCustomerTurn({
        personaContext,
        scenarioContext: {
          currentState: scenarioState.currentState,
          customerObjective: scenario.customerObjective,
        },
        permittedFacts,
        transcript: [],
      });
      openingText = llmResult.output.messageParts.map((p) => p.text).join(' ');
      messageIntent = llmResult.output.intent;
      emotionExp = llmResult.output.emotionExpression;
      aiMeta = llmResult.metadata;
    }

    // 5. Persist opening message
    await createMessage({
      conversationId: conversation._id,
      senderType: 'CUSTOMER',
      senderId: customerFixture.facts.passengerName,
      content: openingText,
      intent: messageIntent,
      emotionExpression: emotionExp,
      aiMetadata: aiMeta,
    });

    // 6. Connect to CRM (Real or Mock)
    try {
      let crmSession = null;
      const category = customFixture?.category || scenario.category || 'FLIGHT_DISRUPTION';

      if (useMockCrm) {
        crmSession = await mockCrmClient.startCustomerSession({
          customerName: customerFixture.facts.passengerName,
          passengerEmail: customerFixture.facts.passengerEmail,
          pnr: customerFixture.facts.pnr,
          flightNumber: customerFixture.facts.flightNumber,
          category,
          initialMessage: openingText,
        });

        // Attach mock listeners
        mockCrmClient.on('chat:message:new', ({ chatId, message }) => {
          if (chatId === crmSession.chatId && message.senderRole === 'AGENT') {
            this.handleAgentResponse({
              conversationId: conversation._id,
              agentMessage: message.text,
              senderName: message.senderName,
              crmChatId: chatId,
              useMockCrm: true,
            });
          }
        });
      } else {
        crmSession = await crmClient.startCustomerSession({
          customerName: customerFixture.facts.passengerName,
          passengerEmail: customerFixture.facts.passengerEmail,
          pnr: customerFixture.facts.pnr,
          flightNumber: customerFixture.facts.flightNumber,
          category,
          initialMessage: openingText,
        });

        // Attach live socket
        crmSocketClient.connectForConversation({
          conversationId: conversation.conversationId,
          chatId: crmSession.chatId,
          token: crmSession.customerSessionToken,
          onAgentMessage: (msg) => {
            this.handleAgentResponse({
              conversationId: conversation._id,
              agentMessage: msg.text,
              senderName: msg.senderName,
              crmChatId: crmSession.chatId,
              crmToken: crmSession.customerSessionToken,
              useMockCrm: false,
            });
          },
          onCrmEvent: (event) => {
            this.handleCrmStatusEvent({
              conversationId: conversation._id,
              conversationPublicId: conversation.conversationId,
              crmChatId: crmSession.chatId,
              event,
            });
          },
        });
      }

      await Conversation.findByIdAndUpdate(conversation._id, {
        $set: {
          'crm.externalConversationId': crmSession.chatId,
          'crm.customerSessionToken': crmSession.customerSessionToken,
        },
      });
    } catch (crmErr) {
      logger.error(`CRM initialization failed for ${conversationId}: ${crmErr.message}`);
      await updateConversationProgress({
        conversationId: conversation._id,
        status: 'FAILED',
        endReason: `CRM_INITIALIZATION_ERROR: ${crmErr.message}`,
      });
    }

    return conversation;
  }

  async handleAgentResponse({ conversationId, agentMessage, senderName, crmChatId, crmToken, useMockCrm }) {
    logger.info(`Received agent message for conversation ${conversationId}: "${agentMessage}"`);

    const conv = await Conversation.findById(conversationId)
      .populate('persona')
      .populate('scenario');

    const ACTIVE_STATUSES = ['ACTIVE', 'RUNNING', 'WAITING', 'NEW', 'WAITING_FOR_AGENT', 'WAITING_FOR_CUSTOMER'];
    if (!conv || !ACTIVE_STATUSES.includes(conv.status)) {
      logger.warn(`Skipping message processing for conversation ${conversationId}: status is "${conv?.status}"`);
      return;
    }

    // 1. Persist Agent Message
    await createMessage({
      conversationId: conv._id,
      senderType: 'AGENT',
      senderId: senderName || 'Support Agent',
      content: agentMessage,
    });

    // ── AHT Silence Limit Check (4 min mid-conversation silence threshold) ──
    // "after aht 4 min between the conversation bot should not reply"
    // Checks if there was a 4+ minute silence between turns in an ongoing conversation
    const existingMessages = await getConversationMessages(conv._id);
    const priorMsgs = existingMessages.messages || [];
    const agentMsgCount = priorMsgs.filter((m) => m.senderType === 'AGENT').length;
    const maxAhtMins = conv.timingConfig?.maxAhtMins ?? 4;
    const MAX_AHT_MS = maxAhtMins * 60 * 1000;

    // Prior message before this agent message was saved
    const lastCustomerMsg = priorMsgs.filter((m) => m.senderType === 'CUSTOMER').slice(-1)[0];
    const turnGapMs = lastCustomerMsg?.sentAt ? (Date.now() - new Date(lastCustomerMsg.sentAt).getTime()) : 0;

    // Only apply the 4-min mid-conversation silence ceiling if this is mid-conversation (not the first agent greeting)
    if (agentMsgCount > 1 && turnGapMs >= MAX_AHT_MS) {
      logger.warn(
        `[AHT 4-Min Rule] Conversation ${conv.conversationId} reached threshold ` +
        `(gap: ${Math.round(turnGapMs / 1000)}s, limit: ${maxAhtMins}m). ` +
        `Bot will not reply. Concluding as ABANDONED.`
      );

      conv.status = 'ABANDONED';
      conv.endedAt = new Date();
      conv.endReason = `AHT_TIMEOUT_4MIN: ${maxAhtMins} minutes of silence elapsed between turns. Customer ceased replying.`;
      await conv.save();

      crmSocketClient.disconnectConversation(conv.conversationId);

      broadcastEvent('conversation:updated', {
        conversationId: conv.conversationId,
        status: 'ABANDONED',
        endReason: conv.endReason,
      });

      broadcastEvent('conversation:completed', {
        conversationId: conv.conversationId,
        outcome: {
          goalAchieved: false,
          reason: conv.endReason,
        },
      });

      return; // Customer ceases replying!
    }

    // 2. Interpret semantic event
    const interpreted = interpretAgentMessage(agentMessage);
    let eventType = interpreted?.eventType || 'AGENT_ACKNOWLEDGED';

    // 3. Advance scenario state machine
    const scenario = conv.scenario || {};
    const terminalStates = Array.isArray(scenario.terminalStates) ? scenario.terminalStates : [];
    const currentScenarioState = {
      currentState: conv.scenarioProgress.currentState,
      visitedStates: conv.scenarioProgress.visitedStates,
      turnCount: conv.scenarioProgress.turnCount,
      acceptedTransitions: conv.scenarioProgress.acceptedTransitions || 0,
      isTerminal: terminalStates.includes(conv.scenarioProgress.currentState),
      maxTurns: scenario.maxTurns || 20,
    };

    const transitionResult = validateAndApplyTransition({
      scenario,
      currentScenarioState,
      eventType,
    });

    let updatedScenarioState = currentScenarioState;

    if (transitionResult.valid) {
      updatedScenarioState = transitionResult.state;
      await recordConversationEvent({
        conversationId: conv._id,
        eventType,
        source: 'SCENARIO_ENGINE',
        evidenceType: 'AGENT_MESSAGE',
        previousState: transitionResult.previousState,
        currentState: transitionResult.targetState,
      });
    }

    // 4. Update dynamic persona emotional metrics & track disclosed facts
    const disclosedFacts = extractDisclosedFacts(priorMsgs, conv.customerFixture?.facts);
    const agentBehavior = detectAgentBehavior(agentMessage, {
      disclosedFacts,
      recentHistory: priorMsgs,
    });

    const updatedPersonaState = updatePersonaDynamics({
      currentState: conv.dynamicPersonaState,
      eventType,
      lastAgentBehavior: agentBehavior,
      scenarioState: updatedScenarioState.currentState,
      disclosedFacts,
      turnNumber: conv.scenarioProgress.turnCount + 1,
    });

    // 5. Check turn limits and terminal state
    const turnState = incrementTurnAndCheckLimits(updatedScenarioState);

    await updateConversationProgress({
      conversationId: conv._id,
      dynamicPersonaState: updatedPersonaState,
      currentScenarioState: turnState,
    });

    if (turnState.isTerminal) {
      logger.info(`Conversation ${conv.conversationId} reached terminal state: ${turnState.currentState}`);
      await this.concludeConversation(conv._id, turnState.currentState === 'COMPLETED' ? 'GOAL_ACHIEVED' : 'TERMINAL_STATE');
      return;
    }

    // ── PHASE 1 & 2: AHT Timing & Reading / Thinking Delays ──
    const chatId = conv.crm?.externalConversationId || crmChatId;
    const persona = conv.persona || conv.personaSnapshot || {};
    const turnNumber = conv.scenarioProgress.turnCount;

    // Check if this is the first agent reply (right after agent accepts chat)
    const isFirstAgentReply = priorMsgs.filter((m) => m.senderType === 'AGENT').length <= 1;

    // Pre-calculate reading + thinking delay (we don't know reply length yet)
    const preTimings = calculateHumanTimings({
      agentMessageLength: (agentMessage || '').length,
      replyLength: 80, // estimate, will refine after generation
      persona,
      turnNumber,
    });

    let totalWaitMs = preTimings.readingDelayMs + preTimings.thinkingDelayMs;

    // "when aht timing is 2 -2:30 min then after accepting bot should reply"
    if (isFirstAgentReply) {
      const minSec = Number(conv.timingConfig?.minWaitSec ?? 3);
      const maxSec = Number(conv.timingConfig?.maxWaitSec ?? 6);
      const postAcceptDelayMs = Math.round((minSec + Math.random() * Math.max(0, maxSec - minSec)) * 1000);
      logger.info(
        `[AHT Post-Accept] First turn after agent accept: applying post-acceptance delay of ` +
        `${Math.round(postAcceptDelayMs / 1000)}s (${minSec}-${maxSec}s window) for ${conv.conversationId}`
      );
      totalWaitMs = Math.max(totalWaitMs, postAcceptDelayMs);

      // If realistic long pacing is enabled (>= 30s), show typing indicator on CRM immediately
      if (postAcceptDelayMs >= 30000 && chatId && !useMockCrm) {
        crmSocketClient.emitTyping(conv.conversationId, chatId, true);
      }
    }

    // Safely wait in short increments while monitoring for cancellation
    const sleepIntervalMs = 1000;
    let waitedMs = 0;
    while (waitedMs < totalWaitMs) {
      const step = Math.min(sleepIntervalMs, totalWaitMs - waitedMs);
      await sleep(step);
      waitedMs += step;

      // Check if conversation was aborted or stopped while waiting
      const current = await Conversation.findById(conv._id).select('status startedAt');
      if (!current || !ACTIVE_STATUSES.includes(current.status)) {
        logger.info(`Conversation ${conv.conversationId} status changed to "${current?.status}". Aborting turn.`);
        return;
      }
    }

    // 6. Generate Next Customer Turn
    const messages = await getConversationMessages(conv._id);
    const personaContext = buildPersonaPromptContext({
      persona: conv.persona,
      dynamicState: updatedPersonaState,
    });
    const permittedFacts = getPermittedFacts({
      scenario,
      currentState: turnState.currentState,
      fixture: conv.customerFixture,
    });

    const llmResult = await this.llmProvider.generateCustomerTurn({
      personaContext,
      scenarioContext: {
        currentState: turnState.currentState,
        customerObjective: scenario.customerObjective,
      },
      permittedFacts,
      disclosedFacts,
      transcript: messages.messages,
    });

    let customerReplyText = llmResult.output.messageParts.map((p) => p.text).join(' ');

    // Anti-repetition check: ensure the bot never sends an identical message to previous turns
    const previousCustomerTexts = (messages.messages || [])
      .filter((m) => m.senderType === 'CUSTOMER')
      .map((m) => (m.content || '').trim().toLowerCase());

    const lastCustomerText = previousCustomerTexts[previousCustomerTexts.length - 1];

    if (lastCustomerText && customerReplyText.trim().toLowerCase() === lastCustomerText) {
      logger.warn(`Duplicate reply detected for ${conv.conversationId}. Applying dynamic rephrasing.`);
      const lowerAgent = (agentMessage || '').toLowerCase();
      if (lowerAgent.includes('escalat') || lowerAgent.includes('escalta') || lowerAgent.includes('transfer') || lowerAgent.includes('supervisor')) {
        customerReplyText = 'Please connect me with your supervisor immediately so we can get this resolved.';
      } else if (lowerAgent.includes('fuck') || lowerAgent.includes('shit') || lowerAgent.includes('shut up')) {
        customerReplyText = 'Your behavior is completely unacceptable. I demand to speak to a manager right now.';
      } else if (lowerAgent.includes('wait') || lowerAgent.includes('moment') || lowerAgent.includes('check')) {
        customerReplyText = 'Sure, take your time. I will be waiting here.';
      } else if (lowerAgent.includes('pnr') || lowerAgent.includes('booking') || lowerAgent.includes('details')) {
        customerReplyText = `My booking reference is ${conv.customerFixture?.facts?.pnr || 'on file'} for flight ${conv.customerFixture?.facts?.flightNumber || 'SW-101'}.`;
      } else if (lowerAgent.includes('refund') || lowerAgent.includes('rebook')) {
        customerReplyText = 'Could you please confirm the options available for this ticket?';
      } else {
        customerReplyText = 'Understood. Please let me know what the next steps are.';
      }
    }

    // ── PHASE 3: "Typing" with Live Indicator ──
    // Recalculate typing duration with actual reply length
    const finalTimings = calculateHumanTimings({
      agentMessageLength: (agentMessage || '').length,
      replyLength: customerReplyText.length,
      persona,
      turnNumber,
    });

    // Show typing indicator on CRM
    if (chatId && !useMockCrm) {
      crmSocketClient.emitTyping(conv.conversationId, chatId, true);
      logger.info(`Typing indicator ON for ${chatId}, duration: ${finalTimings.typingDurationMs}ms`);
    }

    // Wait for the typing duration
    await sleep(finalTimings.typingDurationMs);

    // Stop typing indicator
    if (chatId && !useMockCrm) {
      crmSocketClient.emitTyping(conv.conversationId, chatId, false);
    }

    // 7. Persist and send customer turn
    await createMessage({
      conversationId: conv._id,
      senderType: 'CUSTOMER',
      senderId: conv.customerFixture.facts.passengerName,
      content: customerReplyText,
      intent: llmResult.output.intent,
      emotionExpression: llmResult.output.emotionExpression,
      aiMetadata: llmResult.metadata,
    });

    // Deliver to CRM
    const token = crmToken || conv.crm?.customerSessionToken;

    if (useMockCrm) {
      await mockCrmClient.sendCustomerMessage({ chatId, text: customerReplyText });
    } else if (chatId && token) {
      logger.info(`Delivering customer reply to CRM chat ${chatId}: "${customerReplyText.slice(0, 80)}..."`);
      await crmClient.sendCustomerMessage({ chatId, text: customerReplyText, token });
    } else {
      logger.warn(`Could not deliver customer reply to CRM: missing chatId (${chatId}) or token (${Boolean(token)})`);
    }
  }

  /**
   * Handle CRM lifecycle events (RESOLVED, CLOSED, ESCALATED, etc.)
   * Syncs the bot Conversation status with the CRM's current state.
   */
  async handleCrmStatusEvent({ conversationId, conversationPublicId, crmChatId, event }) {
    const { eventType, data } = event || {};
    const crmStatus = data?.status;
    logger.info(`CRM status event for ${conversationPublicId}: type=${eventType}, crmStatus=${crmStatus}`);

    if (!crmStatus) return;

    // Map CRM statuses to bot-side statuses
    const STATUS_MAP = {
      RESOLVED: 'RESOLVED',
      CLOSED: 'CLOSED',
      ESCALATED: 'ESCALATED',
      TRANSFERRED: 'TRANSFERRED',
      ABANDONED: 'ABANDONED',
      ACTIVE: 'ACTIVE',
      NEW: 'NEW',
      WAITING: 'WAITING',
    };

    const mappedStatus = STATUS_MAP[crmStatus];
    if (!mappedStatus) {
      logger.warn(`Unknown CRM status "${crmStatus}" for ${conversationPublicId}, skipping sync`);
      return;
    }

    try {
      const conv = await Conversation.findById(conversationId);
      if (!conv) return;

      // Don't update if already in a terminal state
      const TERMINAL = ['COMPLETED', 'CONCLUDED', 'FAILED', 'CANCELLED'];
      if (TERMINAL.includes(conv.status)) {
        logger.info(`Bot conversation ${conversationPublicId} already in terminal state "${conv.status}", skipping CRM sync`);
        return;
      }

      // Update bot conversation status
      conv.status = mappedStatus;
      if (crmStatus === 'RESOLVED') conv.endedAt = new Date();
      if (crmStatus === 'CLOSED') conv.endedAt = conv.endedAt || new Date();
      await conv.save();

      logger.info(`Bot conversation ${conversationPublicId} status synced to "${mappedStatus}" from CRM`);

      // Broadcast to bot frontend
      broadcastEvent('conversation:progress', {
        conversationId: conversationPublicId,
        status: mappedStatus,
        crmStatus,
      });

      // If resolved or closed, also conclude on bot side
      if (crmStatus === 'RESOLVED' || crmStatus === 'CLOSED') {
        await this.concludeConversation(conversationId, `CRM_${crmStatus}`);
      }
    } catch (err) {
      logger.error(`Failed to sync CRM status for ${conversationPublicId}: ${err.message}`);
    }
  }

  async concludeConversation(conversationId, reason = 'COMPLETED') {
    const conv = await Conversation.findById(conversationId);
    if (!conv) return;

    // Run deterministic scenario & persona evaluation
    const evalResult = await evaluateConversation(conv._id);

    // Run post-chat Quality Control (QC) scorecard evaluation for L1 (Agent) & L2 (TL/QA)
    const qcResult = await evaluateQc({ conversationId: conv._id, reason });

    const finalStatus =
      reason === 'CRM_RESOLVED' ? 'RESOLVED' :
      reason === 'CRM_CLOSED' ? 'CLOSED' :
      'COMPLETED';

    await updateConversationProgress({
      conversationId: conv._id,
      status: finalStatus,
      endReason: reason,
    });

    await Conversation.findByIdAndUpdate(conv._id, {
      $set: {
        'outcome.goalAchieved': evalResult.goalAchieved,
        'outcome.score': evalResult.overallScore,
        'outcome.assertionResults': evalResult,
        ...(qcResult ? { 'outcome.qcReport': qcResult } : {}),
      },
    });

    crmSocketClient.disconnectConversation(conv.conversationId);

    broadcastEvent('conversation:completed', {
      conversationId: conv.conversationId,
      outcome: evalResult,
      qcReport: qcResult,
    });

    if (qcResult) {
      broadcastEvent('conversation:qc_completed', {
        conversationId: conv.conversationId,
        qcReport: qcResult,
      });
    }
  }
}

export default new ConversationOrchestrator();
