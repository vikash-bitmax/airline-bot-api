import SimulationRun from '../models/SimulationRun.model.js';
import Conversation from '../models/Conversation.model.js';
import ConversationMessage from '../models/ConversationMessage.model.js';
import Persona from '../models/Persona.model.js';
import Scenario from '../models/Scenario.model.js';

export const getOverviewReport = async () => {
  const [totalRuns, conversations, messages, totalPersonas, totalScenarios] = await Promise.all([
    SimulationRun.countDocuments(),
    Conversation.find().lean(),
    ConversationMessage.find().lean(),
    Persona.countDocuments({ isActive: true }),
    Scenario.countDocuments({ isActive: true }),
  ]);

  const totalConversations = conversations.length;
  const completedConversations = conversations.filter((c) => c.status === 'COMPLETED').length;
  const failedConversations = conversations.filter((c) => c.status === 'FAILED').length;
  const activeConversations = conversations.filter((c) => c.status === 'ACTIVE').length;

  const totalCustomerMessages = messages.filter((m) => m.senderType === 'CUSTOMER').length;
  const totalAgentMessages = messages.filter((m) => m.senderType === 'AGENT').length;

  // Compute average scores from completed conversations
  const scoredConvs = conversations.filter((c) => c.outcome && c.outcome.score !== undefined);
  const avgOverallScore = scoredConvs.length
    ? Math.round(scoredConvs.reduce((acc, c) => acc + (c.outcome.score || 0), 0) / scoredConvs.length)
    : 0;

  const successfulConvs = conversations.filter((c) => c.outcome?.goalAchieved);
  const scenarioCompletionRate = totalConversations
    ? Math.round((successfulConvs.length / totalConversations) * 100)
    : 0;

  return {
    runs: { total: totalRuns },
    personas: { activeCount: totalPersonas },
    scenarios: { activeCount: totalScenarios },
    conversations: {
      total: totalConversations,
      completed: completedConversations,
      failed: failedConversations,
      active: activeConversations,
      completionRate: scenarioCompletionRate,
    },
    messages: {
      total: messages.length,
      customer: totalCustomerMessages,
      agent: totalAgentMessages,
    },
    performance: {
      averageScore: avgOverallScore,
      scenarioCompletionRate,
    },
    generatedAt: new Date(),
  };
};

export const getRunReport = async (runId) => {
  const run = await SimulationRun.findOne({ runId }).lean();
  if (!run) throw new Error(`Simulation run not found: ${runId}`);

  const conversations = await Conversation.find({ simulationRun: run._id })
    .populate('persona')
    .populate('scenario')
    .lean();

  const convIds = conversations.map((c) => c._id);
  const messages = await ConversationMessage.find({ conversation: { $in: convIds } }).lean();

  const total = conversations.length;
  const completed = conversations.filter((c) => c.status === 'COMPLETED').length;
  const failed = conversations.filter((c) => c.status === 'FAILED').length;

  return {
    run,
    metrics: {
      totalConversations: total,
      completed,
      failed,
      totalMessages: messages.length,
      customerMessages: messages.filter((m) => m.senderType === 'CUSTOMER').length,
      agentMessages: messages.filter((m) => m.senderType === 'AGENT').length,
    },
    conversations: conversations.map((c) => ({
      conversationId: c.conversationId,
      persona: c.persona?.name,
      scenario: c.scenario?.name,
      status: c.status,
      currentState: c.scenarioProgress?.currentState,
      outcome: c.outcome,
      startedAt: c.startedAt,
      endedAt: c.endedAt,
    })),
  };
};

export default {
  getOverviewReport,
  getRunReport,
};
