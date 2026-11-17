/**
 * Human Typing Simulation Service
 * 
 * Makes bot responses feel natural by introducing:
 * - A "reading" delay (time to read the agent's message)
 * - A "thinking" pause (time to formulate a reply)
 * - A "typing" duration (scales with response length, like a real person)
 * - Variance / jitter so timings are never robotic
 */
import logger from '../utils/logger.js';

/**
 * Calculates realistic delay components based on persona behavior and message content.
 */
export function calculateHumanTimings({
  agentMessageLength = 0,
  replyLength = 0,
  persona = {},
  turnNumber = 1,
}) {
  const behaviorConfig = persona.behaviorConfig || {};
  const traits = persona.traits || {};

  // Base response delay from persona config (default 2500ms)
  const baseDelayMs = behaviorConfig.responseDelayMs || 2500;

  // 1. Reading delay: ~30ms per word of agent message (avg 5 chars/word)
  const agentWordCount = Math.max(1, Math.ceil(agentMessageLength / 5));
  const readingDelayMs = Math.min(agentWordCount * 30, 3000); // cap at 3s

  // 2. Thinking pause: depends on patience (patient people think longer)
  const patience = traits.patience ?? 5;
  const thinkingBaseMs = 800 + (patience * 100); // 900ms–1800ms
  // First turn gets extra thinking time
  const firstTurnBonus = turnNumber <= 1 ? 500 : 0;
  const thinkingDelayMs = thinkingBaseMs + firstTurnBonus;

  // 3. Typing duration: ~60ms per character (average human ~40-80ms/char)
  //    Fast typers: 40ms/char, slow/anxious: 90ms/char
  const typingSpeed = getTypingSpeedMs(persona);
  const replyWordCount = Math.max(1, Math.ceil(replyLength / 5));
  const rawTypingMs = replyLength * typingSpeed;
  // Cap typing to feel natural (2s min, 12s max)
  const typingDurationMs = Math.max(2000, Math.min(rawTypingMs, 12000));

  // 4. Add human jitter (±15% randomness)
  const jitter = (ms) => {
    const variance = ms * 0.15;
    return Math.round(ms + (Math.random() * 2 - 1) * variance);
  };

  const reading = jitter(readingDelayMs);
  const thinking = jitter(thinkingDelayMs);
  const typing = jitter(typingDurationMs);
  const total = reading + thinking + typing;

  logger.info(
    `Human timing: read=${reading}ms, think=${thinking}ms, type=${typing}ms, total=${total}ms ` +
    `(agent=${agentWordCount}w, reply=${replyWordCount}w, speed=${typingSpeed}ms/char)`
  );

  return {
    readingDelayMs: reading,
    thinkingDelayMs: thinking,
    typingDurationMs: typing,
    totalDelayMs: total,
  };
}

/**
 * Returns typing speed in ms per character based on persona traits.
 */
function getTypingSpeedMs(persona) {
  const tone = persona.communicationStyle?.tone || 'neutral';
  const messageLength = persona.communicationStyle?.messageLength || 'moderate';

  // Anxious / elderly → slower typing
  if (tone === 'anxious' || tone === 'confused') return 85;
  // Aggressive / assertive → fast, angry typing
  if (tone === 'aggressive' || tone === 'assertive') return 45;
  // Polite + concise → moderately fast
  if (tone === 'polite' && messageLength === 'concise') return 50;
  // Detailed writers → moderate
  if (messageLength === 'detailed') return 65;
  // Default
  return 60;
}

/**
 * Promise-based sleep utility.
 */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
