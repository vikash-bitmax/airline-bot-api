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

      if (useMockCrm || simulationRun.environment === 'TEST') {
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
              useMockCrm: false,
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

  async handleAgentResponse({ conversationId, agentMessage, senderName, crmChatId, useMockCrm }) {
    logger.info(`Received agent message for conversation ${conversationId}: "${agentMessage}"`);

    const conv = await Conversation.findById(conversationId)
      .populate('persona')
      .populate('scenario');

    if (!conv || conv.status !== 'ACTIVE') return;

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
    const scenario = conv.scenario;
    const currentScenarioState = {
      currentState: conv.scenarioProgress.currentState,
      visitedStates: conv.scenarioProgress.visitedStates,
      turnCount: conv.scenarioProgress.turnCount,
      acceptedTransitions: conv.scenarioProgress.acceptedTransitions || 0,
      isTerminal: scenario.terminalStates.includes(conv.scenarioProgress.currentState),
      maxTurns: scenario.maxTurns,
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

    const customerReplyText = llmResult.output.messageParts.map((p) => p.text).join(' ');

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
    const token = conv.crm?.customerSessionToken;
    const chatId = conv.crm?.externalConversationId || crmChatId;

    if (useMockCrm) {
      await mockCrmClient.sendCustomerMessage({ chatId, text: customerReplyText });
    } else if (chatId && token) {
      await crmClient.sendCustomerMessage({ chatId, text: customerReplyText, token });
    }
  }

  async concludeConversation(conversationId, reason = 'COMPLETED') {
    const conv = await Conversation.findById(conversationId);
    if (!conv) return;

    // Run deterministic evaluation
    const evalResult = await evaluateConversation(conv._id);

    await updateConversationProgress({
      conversationId: conv._id,
      status: 'COMPLETED',
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
