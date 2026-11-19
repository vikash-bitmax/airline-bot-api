export const buildCustomerTurnPrompt = ({
  personaContext,
  scenarioContext,
  permittedFacts,
  transcript = [],
}) => {
  const formattedTranscript = transcript
    .slice(-8)
    .map((m) => `${m.senderType}: ${m.content}`)
    .join('\n');

  const latestAgentMsg = [...transcript].reverse().find((m) => m.senderType === 'AGENT');
  const latestAgentText = latestAgentMsg?.content || '';

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

[LATEST AGENT MESSAGE TO DIRECTLY ANSWER]
"${latestAgentText}"

[INSTRUCTION FOR THIS TURN]
Directly and specifically respond to the [LATEST AGENT MESSAGE TO DIRECTLY ANSWER] above:
- If the agent states they are ESCALATING or TRANSFERRING this query/case (or getting a supervisor/manager): acknowledge the escalation directly in character (e.g. demand that the supervisor actually fixes it quickly, express frustration or relief, or ask how long the transfer will take).
- If the agent states a time or asks a question (e.g. "at 1pm", "is tomorrow okay?"): directly answer whether that works for you or ask clarifying questions based on your Goal.
- PRIVACY CHECK: Did the agent explicitly ask for your booking reference, PNR, flight number, or details?
  - ONLY IF YES: Provide your PNR (${permittedFacts?.pnr || 'available'}) and details from [ALLOWED FACTS].
  - IF NO: DO NOT volunteer your PNR or ticket code yet! Answer their statement naturally like a real human.
- If the agent says they are checking or asks you to wait: acknowledge that you will wait.
- If the agent offers options (rebooking vs refund): state your preference clearly based on your Goal.
- NEVER repeat previous messages or greetings from the transcript.
- Keep in character: ${personaContext.tone} tone, ${personaContext.messageLength} length.

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
