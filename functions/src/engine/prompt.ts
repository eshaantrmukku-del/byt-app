import type { Channel } from '../contract.js';
import type { LlmMessage } from '../llm/types.js';
import { SKILLS } from './framework.js';
import { MOVE_SPECS } from './moves.js';
import { COACH_IDENTITY, STYLE } from './spec.js';
import type { CoachContextData, MovePlan, TurnAnalysis } from './types.js';

export const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: 'What the coach says to the user. Plain text.' },
    goalProgress: {
      type: ['object', 'null'],
      description: 'Only when the user clearly reported concrete progress on one of the listed relevant goals: a suggested new progress % they can confirm. Otherwise null.',
      properties: {
        goalId: { type: 'string' },
        progress: { type: 'integer', minimum: 0, maximum: 100 },
        reason: { type: 'string', description: 'Short, user-facing reason, e.g. "You sent three applications this week."' },
      },
      required: ['goalId', 'progress', 'reason'],
    },
  },
  required: ['reply', 'goalProgress'],
} as const;

function readingOfTurn(a: TurnAnalysis): string {
  const parts = [
    a.emotions.length ? `Feelings: ${a.emotions.join(', ')} (intensity ${a.emotionalIntensity}/3).` : 'No strong feeling expressed.',
    a.keyPhrase ? `Their words that carry weight: "${a.keyPhrase}".` : '',
    a.values.length ? `Values that may be in play: ${a.values.join(', ')}.` : '',
    a.assumptions.length ? `Possible assumptions: ${a.assumptions.map((s) => `"${s}"`).join(', ')}.` : '',
    a.contradiction ? `Tension with earlier: ${a.contradiction}.` : '',
    a.innerCritic ? `Inner critic speaking: "${a.innerCritic}".` : '',
    a.pattern ? `A pattern you may have noticed: ${a.pattern}.` : '',
    a.unspoken ? `Possibly unsaid (a hunch, not a fact): ${a.unspoken}.` : '',
    a.singlePerspective ? 'They seem locked into one way of seeing it.' : '',
    `Energy: ${a.energy}. Stage: ${a.stage}. Intent: ${a.intent.replace('_', ' ')}.`,
  ];
  return parts.filter(Boolean).join(' ');
}

export function buildReplySystem(p: {
  plan: MovePlan;
  analysis: TurnAnalysis;
  channel: Channel;
  contextBlock: string;
  /** The coach's own recent replies, so it can avoid repeating itself. */
  recentReplies?: string[];
  today: string;
  mode: CoachContextData['mode'];
}): string {
  const primary = MOVE_SPECS[p.plan.primary];
  const secondary = p.plan.secondary ? MOVE_SPECS[p.plan.secondary] : undefined;
  const skills = primary.skills.map((id) => `- ${SKILLS[id].name}: ${SKILLS[id].does} Avoid: ${SKILLS[id].avoid}`).join('\n');
  const examples = primary.examples
    .map((e) => `User: ${e.user}\nCoach: ${e.coach}`)
    .join('\n\n');
  return [
    COACH_IDENTITY,
    STYLE[p.channel],
    p.mode === 'reflection'
      ? 'This conversation was opened from Insights so they can reflect on their recent check-ins. Explore what they notice in them; let them lead the meaning.'
      : '',
    `Today is ${p.today}.`,
    p.contextBlock ? `# Background\n${p.contextBlock}` : '',
    `# Your read of their latest message\n${readingOfTurn(p.analysis)}`,
    `# This turn: ${primary.label}\n${primary.guidance}${skills ? `\nSkills in play:\n${skills}` : ''}${secondary ? `\nIf it fits naturally afterwards: ${secondary.label.toLowerCase()} — but never at the cost of the above.` : ''}\nAim for about ${p.plan.targetWords} words. ${
      p.plan.maxQuestions === 0
        ? "Don't ask a question this turn: you've asked several in a row. Say something that lands (what you sense underneath, a connection, an observation or a perspective) and leave space for them. Offer it as your read, not a verdict on who they are or what their choice means."
        : 'At most one question, and only if it opens something.'
    }`,
    p.recentReplies?.length
      ? `# Your last replies (don't reuse their openings, phrases or question shapes)\n${p.recentReplies.map((r) => `- ${r}`).join('\n')}`
      : '',
    examples ? `# The shape of this move (illustration only; never reuse the wording)\n${examples}` : '',
    'Respond with JSON: {"reply": string, "goalProgress": object|null}.',
  ].filter(Boolean).join('\n\n');
}

export function buildReplyMessages(history: CoachContextData['history'], text: string): LlmMessage[] {
  const messages: LlmMessage[] = history.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', text: m.text }));
  messages.push({ role: 'user', text });
  // Gemini expects the conversation to start with the user. A session the coach opened
  // starts with a coach message, so keep it and add a one-line marker in front.
  if (messages[0]?.role === 'model') messages.unshift({ role: 'user', text: '(started a session)' });
  return messages;
}

export function critiquePrompt(issues: { detail: string }[]): string {
  return `Your draft reply broke BYT coaching rules:\n${issues.map((i) => `- ${i.detail}`).join('\n')}\nRewrite the reply to fix these while keeping the same intent for this turn. Respond with the same JSON shape.`;
}
