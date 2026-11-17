import { v4 as uuidv4 } from 'uuid';
import Conversation from '../models/Conversation.model.js';
import Persona from '../models/Persona.model.js';
import Scenario from '../models/Scenario.model.js';
import SimulationRun from '../models/SimulationRun.model.js';

import { generateCustomerFixture } from './fixture-generator.service.js';
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
import GeminiProvider from '../ai/providers/gemini.provider.js';
import crmClient from '../integrations/crm/crm-client.js';
import crmSocketClient from '../integrations/crm/crm-socket.client.js';
import mockCrmClient from '../integrations/crm/mock-crm-client.js';
import { evaluateConversation } from './evaluation.service.js';
import logger from '../utils/logger.js';
import { broadcastEvent } from '../../server.js';

export class ConversationOrchestrator {
  constructor() {
    this.llmProvider = new GeminiProvider();
  }

  async startConversation({
    runId,
    personaId,
    scenarioId,
    randomSeed,
    useMockCrm = false,
    customFixture,
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

    // 1. Generate deterministic fixture
    const customerFixture = generateCustomerFixture({
      randomSeed: randomSeed || simulationRun.configuration?.randomSeed || 'default-seed',
      conversationId,
      scenarioRequirements: scenario.requiredFacts,
    });

    if (customFixture) {
      if (customFixture.passengerName) customerFixture.facts.passengerName = customFixture.passengerName;
      if (customFixture.passengerEmail) customerFixture.facts.passengerEmail = customFixture.passengerEmail;
      if (customFixture.pnr) customerFixture.facts.pnr = customFixture.pnr;
      if (customFixture.flightNumber) customerFixture.facts.flightNumber = customFixture.flightNumber;
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

    // 4. Update dynamic persona emotional metrics
    const updatedPersonaState = updatePersonaDynamics({
      currentState: conv.dynamicPersonaState,
      eventType,
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

    // ── PHASE 1: "Reading" Delay ──
    // Simulate the customer reading the agent's message before reacting
    const chatId = conv.crm?.externalConversationId || crmChatId;
    const persona = conv.persona || conv.personaSnapshot || {};
    const turnNumber = conv.scenarioProgress.turnCount;

    // Pre-calculate reading + thinking delay (we don't know reply length yet)
    const preTimings = calculateHumanTimings({
      agentMessageLength: (agentMessage || '').length,
      replyLength: 80, // estimate, will refine after generation
      persona,
      turnNumber,
    });

    logger.info(`Simulating reading delay: ${preTimings.readingDelayMs}ms for ${conv.conversationId}`);
    await sleep(preTimings.readingDelayMs);

    // ── PHASE 2: "Thinking" Delay ──
    logger.info(`Simulating thinking pause: ${preTimings.thinkingDelayMs}ms for ${conv.conversationId}`);
    await sleep(preTimings.thinkingDelayMs);

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
      if (lowerAgent.includes('wait') || lowerAgent.includes('moment') || lowerAgent.includes('check')) {
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

    // Run deterministic evaluation
    const evalResult = await evaluateConversation(conv._id);

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
      },
    });

    crmSocketClient.disconnectConversation(conv.conversationId);

    broadcastEvent('conversation:completed', {
      conversationId: conv.conversationId,
      outcome: evalResult,
    });
  }
}

export default new ConversationOrchestrator();
