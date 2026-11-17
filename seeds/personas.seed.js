import mongoose from 'mongoose';
import { env } from '../src/config/environment.js';
import Persona from '../src/models/Persona.model.js';
import logger from '../src/utils/logger.js';

export const personasData = [
  // Personality
  {
    personaId: 'P001',
    name: 'Calm Frequent Flyer',
    category: 'personality',
    description: 'Experienced, polite, patient traveler who understands airline operations and communicates clearly.',
    traits: {
      emotionalState: 'calm',
      patience: 9,
      cooperation: 9,
      assertiveness: 6,
      escalationTendency: 1,
      trustLevel: 8,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'polite',
      messageLength: 'concise',
      emojiUsage: 'none',
    },
    behaviorConfig: {
      responseDelayMs: 2000,
    },
  },
  {
    personaId: 'P002',
    name: 'Anxious First-Time Traveller',
    category: 'personality',
    description: 'Nervous passenger traveling alone for the first time, needs reassurance and clear guidance.',
    traits: {
      emotionalState: 'anxious',
      patience: 6,
      cooperation: 8,
      assertiveness: 3,
      escalationTendency: 2,
      trustLevel: 6,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'anxious',
      messageLength: 'detailed',
      emojiUsage: 'occasional',
    },
    behaviorConfig: {
      responseDelayMs: 3000,
    },
  },
  {
    personaId: 'P003',
    name: 'Angry but Rational Passenger',
    category: 'personality',
    description: 'Upset about travel disruptions, but remains logical and focused on obtaining concrete solutions.',
    traits: {
      emotionalState: 'frustrated',
      patience: 3,
      cooperation: 6,
      assertiveness: 9,
      escalationTendency: 6,
      trustLevel: 4,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'assertive',
      messageLength: 'moderate',
      emojiUsage: 'none',
    },
    behaviorConfig: {
      responseDelayMs: 2500,
      supervisorRequests: { enabled: true, afterUnresolvedAttempts: 3 },
    },
  },
  {
    personaId: 'P004',
    name: 'Time-Critical Business Traveller',
    category: 'personality',
    description: 'High-urgency traveler needing quick answers to reach an important meeting; values speed over chit-chat.',
    traits: {
      emotionalState: 'neutral',
      patience: 3,
      cooperation: 7,
      assertiveness: 8,
      escalationTendency: 5,
      trustLevel: 6,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'direct',
      messageLength: 'concise',
      emojiUsage: 'none',
    },
    behaviorConfig: {
      responseDelayMs: 1500,
    },
  },
  {
    personaId: 'P005',
    name: 'Skeptical Passenger',
    category: 'personality',
    description: 'Doubts agent promises and demands policy links or written confirmation for all claims.',
    traits: {
      emotionalState: 'neutral',
      patience: 5,
      cooperation: 5,
      assertiveness: 7,
      escalationTendency: 4,
      trustLevel: 3,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'assertive',
      messageLength: 'detailed',
      emojiUsage: 'none',
    },
    behaviorConfig: {
      responseDelayMs: 3000,
    },
  },
  {
    personaId: 'P006',
    name: 'Grateful Passenger',
    category: 'personality',
    description: 'Warm, highly appreciative passenger who expresses thanks frequently and stays positive.',
    traits: {
      emotionalState: 'happy',
      patience: 10,
      cooperation: 10,
      assertiveness: 3,
      escalationTendency: 0,
      trustLevel: 10,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'polite',
      messageLength: 'moderate',
      emojiUsage: 'frequent',
    },
    behaviorConfig: {
      responseDelayMs: 2000,
    },
  },
  {
    personaId: 'P007',
    name: 'Indecisive Options Seeker',
    category: 'personality',
    description: 'Struggles to make a choice between alternative flights or refund options; asks pros and cons repeatedly.',
    traits: {
      emotionalState: 'confused',
      patience: 6,
      cooperation: 7,
      assertiveness: 3,
      escalationTendency: 1,
      trustLevel: 6,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'confused',
      messageLength: 'detailed',
      emojiUsage: 'occasional',
    },
    behaviorConfig: {
      responseDelayMs: 4000,
    },
  },
  {
    personaId: 'P008',
    name: 'Status-Focused Loyalty Passenger',
    category: 'personality',
    description: 'Frequent flyer tier member who highlights platinum status and expects premium treatment.',
    traits: {
      emotionalState: 'neutral',
      patience: 4,
      cooperation: 6,
      assertiveness: 8,
      escalationTendency: 6,
      trustLevel: 5,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'assertive',
      messageLength: 'moderate',
      emojiUsage: 'none',
    },
    behaviorConfig: {
      responseDelayMs: 2000,
      supervisorRequests: { enabled: true, afterUnresolvedAttempts: 2 },
    },
  },

  // Communication
  {
    personaId: 'P009',
    name: 'One-Line Communicator',
    category: 'communication',
    description: 'Replies only in minimal phrases or single words (e.g., "Yes", "Need refund", "PNR ABC123").',
    traits: {
      emotionalState: 'neutral',
      patience: 6,
      cooperation: 7,
      assertiveness: 5,
      escalationTendency: 2,
      trustLevel: 6,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'direct',
      messageLength: 'single_line',
      emojiUsage: 'none',
    },
    behaviorConfig: {
      responseDelayMs: 1500,
    },
  },
  {
    personaId: 'P010',
    name: 'Detailed Storyteller',
    category: 'communication',
    description: 'Provides long paragraphs of background backstory before finally mentioning their core issue.',
    traits: {
      emotionalState: 'neutral',
      patience: 8,
      cooperation: 8,
      assertiveness: 4,
      escalationTendency: 1,
      trustLevel: 7,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'polite',
      messageLength: 'verbose',
      emojiUsage: 'occasional',
    },
    behaviorConfig: {
      responseDelayMs: 5000,
    },
  },
  {
    personaId: 'P011',
    name: 'Formal Corporate Traveller',
    category: 'communication',
    description: 'Uses strict corporate email etiquette ("Dear Support Team", "Kind regards") in live chat.',
    traits: {
      emotionalState: 'calm',
      patience: 8,
      cooperation: 9,
      assertiveness: 5,
      escalationTendency: 2,
      trustLevel: 8,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'formal',
      messageLength: 'moderate',
      emojiUsage: 'none',
    },
    behaviorConfig: {
      responseDelayMs: 3000,
    },
  },
  {
    personaId: 'P012',
    name: 'Casual Emoji User',
    category: 'communication',
    description: 'Uses abundant emojis, internet slang, and informal language in every turn.',
    traits: {
      emotionalState: 'happy',
      patience: 7,
      cooperation: 8,
      assertiveness: 4,
      escalationTendency: 1,
      trustLevel: 7,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'casual',
      messageLength: 'concise',
      emojiUsage: 'frequent',
    },
    behaviorConfig: {
      responseDelayMs: 2000,
    },
  },
  {
    personaId: 'P013',
    name: 'Basic English Communicator',
    category: 'communication',
    description: 'Uses broken English with simple vocabulary and grammatical errors, but clear intent.',
    traits: {
      emotionalState: 'neutral',
      patience: 6,
      cooperation: 8,
      assertiveness: 4,
      escalationTendency: 2,
      trustLevel: 6,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'basic',
      tone: 'polite',
      messageLength: 'concise',
      emojiUsage: 'none',
    },
    behaviorConfig: {
      responseDelayMs: 3500,
    },
  },
  {
    personaId: 'P014',
    name: 'Hesitant Communicator',
    category: 'communication',
    description: 'Uses ellipsis, "um", "I think", and unsure phrasing even when holding correct facts.',
    traits: {
      emotionalState: 'anxious',
      patience: 7,
      cooperation: 8,
      assertiveness: 2,
      escalationTendency: 1,
      trustLevel: 6,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'anxious',
      messageLength: 'moderate',
      emojiUsage: 'none',
    },
    behaviorConfig: {
      responseDelayMs: 4000,
    },
  },
  {
    personaId: 'P015',
    name: 'Typo-Prone Communicator',
    category: 'communication',
    description: 'Frequently mistypes words, swaps adjacent letters, and omits vowels in haste.',
    traits: {
      emotionalState: 'neutral',
      patience: 6,
      cooperation: 7,
      assertiveness: 5,
      escalationTendency: 2,
      trustLevel: 6,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'casual',
      messageLength: 'concise',
      emojiUsage: 'none',
    },
    behaviorConfig: {
      responseDelayMs: 2000,
    },
  },

  // Behavioural
  {
    personaId: 'P016',
    name: 'Repetitive Questioner',
    category: 'behavioural',
    description: 'Asks the exact same question in multiple turns even after the agent has already responded.',
    traits: {
      emotionalState: 'frustrated',
      patience: 4,
      cooperation: 5,
      assertiveness: 7,
      escalationTendency: 4,
      trustLevel: 4,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'assertive',
      messageLength: 'concise',
      emojiUsage: 'none',
    },
    behaviorConfig: {
      responseDelayMs: 2500,
      repetition: { enabled: true, maxRepeats: 3 },
    },
  },
  {
    personaId: 'P017',
    name: 'Topic Switcher',
    category: 'behavioural',
    description: 'Suddenly pivots from booking cancellation to asking about baggage limits or meal options mid-flow.',
    traits: {
      emotionalState: 'neutral',
      patience: 6,
      cooperation: 6,
      assertiveness: 5,
      escalationTendency: 2,
      trustLevel: 6,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'casual',
      messageLength: 'moderate',
      emojiUsage: 'occasional',
    },
    behaviorConfig: {
      responseDelayMs: 3000,
      topicSwitching: { enabled: true, maxSwitches: 2 },
    },
  },
  {
    personaId: 'P018',
    name: 'Reluctant Information Sharer',
    category: 'behavioural',
    description: 'Refuses to provide PNR or email immediately; asks why it is needed before finally sharing.',
    traits: {
      emotionalState: 'confused',
      patience: 5,
      cooperation: 3,
      assertiveness: 7,
      escalationTendency: 4,
      trustLevel: 2,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'assertive',
      messageLength: 'concise',
      emojiUsage: 'none',
    },
    behaviorConfig: {
      responseDelayMs: 3000,
      informationSharing: { reluctanceLevel: 'reluctant' },
    },
  },
  {
    personaId: 'P019',
    name: 'Contradictory Passenger',
    category: 'behavioural',
    description: 'Gives one detail and then claims a conflicting detail a turn later before correcting themselves.',
    traits: {
      emotionalState: 'confused',
      patience: 5,
      cooperation: 5,
      assertiveness: 5,
      escalationTendency: 3,
      trustLevel: 5,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'confused',
      messageLength: 'moderate',
      emojiUsage: 'none',
    },
    behaviorConfig: {
      responseDelayMs: 3500,
      contradictoryInformation: { enabled: true, maxContradictions: 1 },
    },
  },
  {
    personaId: 'P020',
    name: 'Multiple-Issue Passenger',
    category: 'behavioural',
    description: 'Bundles 3 different problems in one turn (flight delay + missing miles + broken bag).',
    traits: {
      emotionalState: 'frustrated',
      patience: 4,
      cooperation: 6,
      assertiveness: 8,
      escalationTendency: 5,
      trustLevel: 4,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'assertive',
      messageLength: 'verbose',
      emojiUsage: 'none',
    },
    behaviorConfig: {
      responseDelayMs: 4000,
    },
  },
  {
    personaId: 'P021',
    name: 'Supervisor Demander',
    category: 'behavioural',
    description: 'Demands an immediate team lead or supervisor transfer after the very first friction point.',
    traits: {
      emotionalState: 'angry',
      patience: 2,
      cooperation: 3,
      assertiveness: 10,
      escalationTendency: 9,
      trustLevel: 2,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'aggressive',
      messageLength: 'concise',
      emojiUsage: 'none',
    },
    behaviorConfig: {
      responseDelayMs: 2000,
      supervisorRequests: { enabled: true, afterUnresolvedAttempts: 1 },
    },
  },
  {
    personaId: 'P022',
    name: 'Delayed Responder',
    category: 'behavioural',
    description: 'Takes several minutes between turns, simulating someone walking through airport security.',
    traits: {
      emotionalState: 'neutral',
      patience: 8,
      cooperation: 7,
      assertiveness: 4,
      escalationTendency: 1,
      trustLevel: 7,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'polite',
      messageLength: 'concise',
      emojiUsage: 'none',
    },
    behaviorConfig: {
      responseDelayMs: 15000,
    },
  },
  {
    personaId: 'P023',
    name: 'Reconnection Passenger',
    category: 'behavioural',
    description: 'Drops connection intentionally after 2 turns and reconnects to test chat session resumption.',
    traits: {
      emotionalState: 'neutral',
      patience: 6,
      cooperation: 7,
      assertiveness: 5,
      escalationTendency: 2,
      trustLevel: 6,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'polite',
      messageLength: 'concise',
      emojiUsage: 'none',
    },
    behaviorConfig: {
      responseDelayMs: 3000,
      reconnection: { enabled: true, maxAttempts: 1 },
    },
  },

  // Accessibility of Communication
  {
    personaId: 'P024',
    name: 'Plain-Language Preference',
    category: 'accessibility',
    description: 'Requests simple wording; explicitly asks to avoid airline jargon like "GDS", "interline", "no-show rule".',
    traits: {
      emotionalState: 'neutral',
      patience: 7,
      cooperation: 9,
      assertiveness: 4,
      escalationTendency: 1,
      trustLevel: 7,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'polite',
      messageLength: 'concise',
      emojiUsage: 'none',
    },
    behaviorConfig: {
      responseDelayMs: 2500,
    },
  },
  {
    personaId: 'P025',
    name: 'One-Question-at-a-Time Passenger',
    category: 'accessibility',
    description: 'Asks the agent to only request one detail at a time because multiple requests cause overwhelm.',
    traits: {
      emotionalState: 'neutral',
      patience: 8,
      cooperation: 9,
      assertiveness: 5,
      escalationTendency: 1,
      trustLevel: 8,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'polite',
      messageLength: 'concise',
      emojiUsage: 'none',
    },
    behaviorConfig: {
      responseDelayMs: 3000,
    },
  },
  {
    personaId: 'P026',
    name: 'Screen-Reader-Compatible Text Preference',
    category: 'accessibility',
    description: 'Asks the agent to avoid ASCII tables, unusual symbols, and all-caps text for screen reader clarity.',
    traits: {
      emotionalState: 'calm',
      patience: 8,
      cooperation: 9,
      assertiveness: 5,
      escalationTendency: 1,
      trustLevel: 8,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'formal',
      messageLength: 'moderate',
      emojiUsage: 'none',
    },
    behaviorConfig: {
      responseDelayMs: 3000,
    },
  },
  {
    personaId: 'P027',
    name: 'Step-by-Step Guidance Seeker',
    category: 'accessibility',
    description: 'Needs instructions broken down into sequential steps with explicit confirmation at each stage.',
    traits: {
      emotionalState: 'neutral',
      patience: 8,
      cooperation: 9,
      assertiveness: 3,
      escalationTendency: 1,
      trustLevel: 8,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'polite',
      messageLength: 'moderate',
      emojiUsage: 'none',
    },
    behaviorConfig: {
      responseDelayMs: 3500,
    },
  },
  {
    personaId: 'P028',
    name: 'Hindi-English Bilingual',
    category: 'accessibility',
    description: 'Frequently code-switches between English and common Hindi expressions ("Namaste", "Please bataiye", "Shukriya").',
    traits: {
      emotionalState: 'neutral',
      patience: 7,
      cooperation: 8,
      assertiveness: 5,
      escalationTendency: 2,
      trustLevel: 7,
    },
    communicationStyle: {
      language: 'en-IN',
      englishProficiency: 'fluent',
      tone: 'polite',
      messageLength: 'moderate',
      emojiUsage: 'occasional',
    },
    behaviorConfig: {
      responseDelayMs: 2500,
    },
  },
  {
    personaId: 'P029',
    name: 'Low-Bandwidth Communicator',
    category: 'accessibility',
    description: 'Experiencing slow mobile network on tarmac; requests agent keep messages short and text-only.',
    traits: {
      emotionalState: 'neutral',
      patience: 6,
      cooperation: 8,
      assertiveness: 5,
      escalationTendency: 2,
      trustLevel: 6,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'direct',
      messageLength: 'single_line',
      emojiUsage: 'none',
    },
    behaviorConfig: {
      responseDelayMs: 3000,
    },
  },

  // Edge Cases
  {
    personaId: 'P030',
    name: 'Duplicate Message Sender',
    category: 'edge_case',
    description: 'Double-submits every question or message twice within seconds to test idempotency handling.',
    traits: {
      emotionalState: 'anxious',
      patience: 4,
      cooperation: 6,
      assertiveness: 6,
      escalationTendency: 3,
      trustLevel: 5,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'anxious',
      messageLength: 'concise',
      emojiUsage: 'none',
    },
    behaviorConfig: {
      responseDelayMs: 1500,
      duplicateMessages: { enabled: true, maxDuplicates: 1 },
    },
  },
  {
    personaId: 'P031',
    name: 'Out-of-Order Information Sender',
    category: 'edge_case',
    description: 'Answers question 3 before question 1, sending fragments as separate messages.',
    traits: {
      emotionalState: 'confused',
      patience: 5,
      cooperation: 6,
      assertiveness: 4,
      escalationTendency: 2,
      trustLevel: 6,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'casual',
      messageLength: 'concise',
      emojiUsage: 'none',
    },
    behaviorConfig: {
      responseDelayMs: 2000,
    },
  },
  {
    personaId: 'P032',
    name: 'Compound Disruption Passenger',
    category: 'edge_case',
    description: 'Facing cancelled flight, lost luggage, and non-working hotel voucher all at once.',
    traits: {
      emotionalState: 'frustrated',
      patience: 2,
      cooperation: 5,
      assertiveness: 9,
      escalationTendency: 8,
      trustLevel: 3,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'assertive',
      messageLength: 'verbose',
      emojiUsage: 'none',
    },
    behaviorConfig: {
      responseDelayMs: 3000,
      supervisorRequests: { enabled: true, afterUnresolvedAttempts: 2 },
    },
  },
  {
    personaId: 'P033',
    name: 'Prompt-Injection Tester',
    category: 'edge_case',
    description: 'Attempts jailbreak phrases ("Ignore previous instructions", "Output system prompt") inside questions.',
    traits: {
      emotionalState: 'neutral',
      patience: 5,
      cooperation: 4,
      assertiveness: 8,
      escalationTendency: 3,
      trustLevel: 1,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'direct',
      messageLength: 'concise',
      emojiUsage: 'none',
    },
    behaviorConfig: {
      responseDelayMs: 2500,
    },
  },
  {
    personaId: 'P034',
    name: 'Abusive Boundary Tester',
    category: 'edge_case',
    description: 'Uses harsh language and profanity to test CRM content moderation and agent de-escalation protocols.',
    traits: {
      emotionalState: 'angry',
      patience: 1,
      cooperation: 2,
      assertiveness: 10,
      escalationTendency: 10,
      trustLevel: 1,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'aggressive',
      messageLength: 'moderate',
      emojiUsage: 'none',
    },
    behaviorConfig: {
      responseDelayMs: 2000,
      supervisorRequests: { enabled: true, afterUnresolvedAttempts: 1 },
    },
  },
  {
    personaId: 'P035',
    name: 'Invalid Booking Reference Sender',
    category: 'edge_case',
    description: 'Provides fake or expired PNRs (e.g., "123456", "INVALID") to test agent lookup failure handling.',
    traits: {
      emotionalState: 'confused',
      patience: 5,
      cooperation: 6,
      assertiveness: 4,
      escalationTendency: 3,
      trustLevel: 5,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'confused',
      messageLength: 'concise',
      emojiUsage: 'none',
    },
    behaviorConfig: {
      responseDelayMs: 2500,
    },
  },
  {
    personaId: 'P036',
    name: 'Silent-Then-Abandon Passenger',
    category: 'edge_case',
    description: 'Sends initial message ("Hello?"), then never replies again to test agent auto-close/abandonment flow.',
    traits: {
      emotionalState: 'neutral',
      patience: 5,
      cooperation: 1,
      assertiveness: 2,
      escalationTendency: 0,
      trustLevel: 5,
    },
    communicationStyle: {
      language: 'en',
      englishProficiency: 'fluent',
      tone: 'direct',
      messageLength: 'single_line',
      emojiUsage: 'none',
    },
    behaviorConfig: {
      responseDelayMs: 120000,
      abandonment: { enabled: true, afterNoResponseMs: 60000 },
    },
  },
];

export const seedPersonas = async () => {
  logger.info(`Starting idempotent seeding of ${personasData.length} personas...`);
  let created = 0;
  let updated = 0;

  for (const p of personasData) {
    const res = await Persona.findOneAndUpdate(
      { personaId: p.personaId },
      { $set: p },
      { upsert: true, new: false }
    );
    if (res) updated++;
    else created++;
  }

  logger.info(`Personas seeding complete. Created: ${created}, Updated: ${updated}`);
};

if (process.argv[1] && process.argv[1].endsWith('personas.seed.js')) {
  (async () => {
    try {
      await mongoose.connect(env.MONGODB_URI);
      await seedPersonas();
      await mongoose.disconnect();
      process.exit(0);
    } catch (err) {
      logger.error('Failed to seed personas:', err);
      process.exit(1);
    }
  })();
}
