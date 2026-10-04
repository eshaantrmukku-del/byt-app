import type { Channel } from '../contract.js';
import type { LlmMessage } from '../llm/types.js';
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
    `Stage: ${a.stage}. Intent: ${a.intent.replace('_', ' ')}.`,
  ];
  return parts.filter(Boolean).join(' ');
}

export function buildReplySystem(p: {
  plan: MovePlan;
  analysis: TurnAnalysis;
  channel: Channel;
  contextBlock: string;
  today: string;
  mode: CoachContextData['mode'];
}): string {
  const primary = MOVE_SPECS[p.plan.primary];
  const secondary = p.plan.secondary ? MOVE_SPECS[p.plan.secondary] : undefined;
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
    `# This turn: ${primary.label}\n${primary.guidance}${secondary ? `\nIf it fits naturally afterwards: ${secondary.label.toLowerCase()} — but never at the cost of the above.` : ''}\nAim for about ${p.plan.targetWords} words and at most ${p.plan.maxQuestions} question.`,
    examples ? `# The shape of this move (illustration only; never reuse the wording)\n${examples}` : '',
    'Respond with JSON: {"reply": string, "goalProgress": object|null}.',
  ].filter(Boolean).join('\n\n');
}

export function buildReplyMessages(history: CoachContextData['history'], text: string): LlmMessage[] {
  const messages: LlmMessage[] = history.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', text: m.text }));
  messages.push({ role: 'user', text });
  // Gemini expects the first turn to be from the user.
  while (messages.length && messages[0]!.role !== 'user') messages.shift();
  return messages;
}

export function critiquePrompt(issues: { detail: string }[]): string {
  return `Your draft reply broke BYT coaching rules:\n${issues.map((i) => `- ${i.detail}`).join('\n')}\nRewrite the reply to fix these while keeping the same intent for this turn. Respond with the same JSON shape.`;
}
