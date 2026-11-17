export const buildCustomerTurnPrompt = ({
  personaContext,
  scenarioContext,
  permittedFacts,
  transcript = [],
}) => {
  const formattedTranscript = transcript
    .slice(-6)
    .map((m) => `${m.senderType}: ${m.content}`)
    .join('\n');

  return `
[CUSTOMER PERSONA]
Name: ${personaContext.name}
Tone: ${personaContext.tone}
Message Length: ${personaContext.messageLength}
English Proficiency: ${personaContext.englishProficiency}
Current Emotional State: ${personaContext.emotionalState} (Frustration: ${personaContext.frustration}/10, Satisfaction: ${personaContext.satisfaction}/10)
Supervisor Demanded: ${personaContext.shouldRequestSupervisor ? 'YES' : 'NO'}

[SCENARIO OBJECTIVE]
Goal: ${scenarioContext.customerObjective}
Current Step: ${scenarioContext.currentState}

[ALLOWED FACTS (YOU MAY ONLY MENTION THESE)]
${JSON.stringify(permittedFacts, null, 2)}

[RECENT CHAT TRANSCRIPT]
${formattedTranscript || '(No previous messages. This is the opening message.)'}

Respond with a JSON object conforming to:
{
  "schemaVersion": "1.0",
  "messageParts": [{"type": "text", "text": "Your customer response here"}],
  "intent": "SHORT_INTENT_NAME",
  "speechAct": "REQUEST_INFORMATION | STATEMENT | COMPLAINT | CONFIRMATION",
  "emotionExpression": "CALM | ANXIOUS | FRUSTRATED | ANGRY | HAPPY",
  "behaviorTags": ["DIRECT_COMMUNICATION"]
}
`;
};

export default {
  buildCustomerTurnPrompt,
};
