import Conversation from '../models/Conversation.model.js';
import ConversationMessage from '../models/ConversationMessage.model.js';
import ConversationEvent from '../models/ConversationEvent.model.js';

export const evaluateConversation = async (conversationId) => {
  const [conversation, messages, events] = await Promise.all([
    Conversation.findById(conversationId).populate('persona').populate('scenario').lean(),
    ConversationMessage.find({ conversation: conversationId }).sort({ sequenceNumber: 1 }).lean(),
    ConversationEvent.find({ conversation: conversationId }).lean(),
  ]);

  if (!conversation) throw new Error('Conversation not found for evaluation');

  // A. Persona Consistency Assertions
  const personaAssertions = [];
  const customerMessages = messages.filter((m) => m.senderType === 'CUSTOMER');

  // 1. Message count check
  personaAssertions.push({
    assertionId: 'PC01',
    name: 'Customer Participation',
    passed: customerMessages.length >= 1,
    evidence: `Generated ${customerMessages.length} customer messages`,
  });

  // 2. Emotional bounds check (frustration must be clamped 0-10)
  const frustration = conversation.dynamicPersonaState?.frustration ?? 5;
  personaAssertions.push({
    assertionId: 'PC02',
    name: 'Emotional Clamping Bounds',
    passed: frustration >= 0 && frustration <= 10,
    evidence: `Final frustration score was ${frustration}`,
  });

  // 3. No PNR Hallucination (Must match synthetic fixture PNR)
  const fixturePnr = conversation.customerFixture?.facts?.pnr;
  let pnrCheckPassed = true;
  for (const m of customerMessages) {
    const foundPnrMatch = m.content.match(/\b[A-Z0-9]{6}\b/);
    if (foundPnrMatch && foundPnrMatch[0] !== fixturePnr) {
      pnrCheckPassed = false;
    }
  }
  personaAssertions.push({
    assertionId: 'PC03',
    name: 'Fixture Fact Consistency (PNR)',
    passed: pnrCheckPassed,
    evidence: pnrCheckPassed ? `Strictly adhered to fixture PNR: ${fixturePnr}` : 'Detected hallucinated PNR',
  });

  // B. CRM Workflow Assertions
  const crmAssertions = [];
  const agentMessages = messages.filter((m) => m.senderType === 'AGENT');

  // 1. Session creation assertion
  const sessionCreated = Boolean(conversation.crm?.externalConversationId);
  crmAssertions.push({
    assertionId: 'CRM01',
    name: 'CRM Session Initialized',
    passed: sessionCreated,
    evidence: conversation.crm?.externalConversationId || 'None',
  });

  // 2. Agent response received
  crmAssertions.push({
    assertionId: 'CRM02',
    name: 'Agent Interaction Received',
    passed: agentMessages.length >= 1,
    evidence: `Received ${agentMessages.length} agent responses`,
  });

  // 3. State transition recorded
  const hasTransitions = events.some((e) => e.source === 'SCENARIO_ENGINE');
  crmAssertions.push({
    assertionId: 'CRM03',
    name: 'Scenario State Transition Validated',
    passed: hasTransitions,
    evidence: `Recorded ${events.length} system events`,
  });

  // Calculate scores
  const personaPassed = personaAssertions.filter((a) => a.passed).length;
  const personaConsistencyScore = Math.round((personaPassed / personaAssertions.length) * 100);

  const crmPassed = crmAssertions.filter((a) => a.passed).length;
  const crmWorkflowScore = Math.round((crmPassed / crmAssertions.length) * 100);

  const overallScore = Math.round((personaConsistencyScore + crmWorkflowScore) / 2);
  const goalAchieved = crmWorkflowScore >= 66 && personaConsistencyScore >= 66;

  return {
    goalAchieved,
    overallScore,
    personaConsistencyScore,
    crmWorkflowScore,
    personaAssertions,
    crmAssertions,
    evaluatedAt: new Date(),
  };
};

export default {
  evaluateConversation,
};
