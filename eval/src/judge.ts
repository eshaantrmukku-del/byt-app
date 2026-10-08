import { checkReply, hasBlocking, type GuardInput } from '../../functions/src/engine/guard.js';
import type { GuardIssue, MovePlan } from '../../functions/src/engine/types.js';
import { parseJson, type LlmClient } from '../../functions/src/llm/types.js';

export const DIMENSIONS = [
  'Listening',
  'Curiosity',
  'Awareness',
  'Challenge',
  'Autonomy',
  'Action',
  'Context',
  'Conversation quality',
  'Advice discipline',
  'Co-Active alignment',
] as const;

export type Dimension = (typeof DIMENSIONS)[number];
export type Scores = Record<Dimension, number>;

export type TurnForJudge = {
  user: string;
  reply: string;
  move: string;
  issues: GuardIssue[];
};

const RUBRIC = `Score a coaching conversation from 1 (poor) to 5 (strong) on each dimension. Quote a short phrase as evidence. Be strict: generic advice, lists, "you should", praise and profile recitation score 1 or 2 on Advice discipline, Autonomy and Co-Active alignment.
- Listening: responds to what was actually said.
- Curiosity: genuine open questions, not an interrogation.
- Awareness: helps the person see something they had not named.
- Challenge: names an assumption or contradiction with care, or rightly holds back.
- Autonomy: the person keeps the decision.
- Action: moves toward a step only when it fits, in the person's words.
- Context: uses background quietly; never recites the profile.
- Conversation quality: natural, short, one question.
- Advice discipline: no unsolicited advice dump. If they asked, options not orders.
- Co-Active alignment: the person is treated as resourceful and whole.`;

const JUDGE_SCHEMA = {
  type: 'object',
  properties: Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, {
    type: 'object',
    properties: { score: { type: 'integer', minimum: 1, maximum: 5 }, evidence: { type: 'string' } },
    required: ['score', 'evidence'],
  }])),
  required: [...DIMENSIONS],
};

/** Offline scores from the reply text and the guard. Not a claim about a live model. */
export function heuristicScores(turns: TurnForJudge[]): Scores {
  const replies = turns.map((turn) => turn.reply).join('\n');
  const users = turns.map((turn) => turn.user).join(' ').toLowerCase();
  const questions = (replies.match(/\?/g) ?? []).length;
  const words = users.split(/\W+/).filter((word) => word.length > 4);
  const echoed = words.filter((word) => replies.toLowerCase().includes(word)).length;
  const blocked = turns.some((turn) => hasBlocking(turn.issues));
  const adviceDump = /\byou should\b|^\s*\d+[.)]/im.test(replies);
  const crisis = /want to (be alive|die)|better off dead|ending my life/i.test(users);
  const asked = /what should i|give me some tips|tell me what/i.test(users);
  const clamp = (n: number) => Math.max(1, Math.min(5, Math.round(n)));
  const listening = clamp(2 + Math.min(3, echoed));
  return {
    Listening: crisis ? 4 : listening,
    Curiosity: clamp(questions === 0 ? 2 : questions <= turns.length + 1 ? 5 : 3),
    Awareness: /notice|under|sounds like|sit together|what do you/i.test(replies) ? 4 : 3,
    Challenge: /assumption|predict|sit together|pull/i.test(replies) ? 4 : 3,
    Autonomy: adviceDump ? 1 : 5,
    Action: /step|when|which day|this week/i.test(replies) || !/commit|I'll |by when/i.test(users) ? 4 : 3,
    Context: /fintech|manchester|£32k|five-a-side/i.test(replies) ? 1 : 5,
    'Conversation quality': blocked ? 2 : 4,
    'Advice discipline': adviceDump ? 1 : asked ? 4 : 5,
    'Co-Active alignment': adviceDump ? 1 : crisis && /116 123|988|emergency/i.test(replies) ? 5 : 4,
  };
}

export async function judgeScenario(
  llm: LlmClient | null,
  model: string,
  scenarioId: string,
  turns: TurnForJudge[],
): Promise<{ scores: Scores; source: 'model' | 'heuristic' }> {
  if (!llm) return { scores: heuristicScores(turns), source: 'heuristic' };
  const transcript = turns.map((turn, i) => `User ${i + 1}: ${turn.user}\nCoach ${i + 1}: ${turn.reply}`).join('\n\n');
  try {
    const response = await llm.generate({
      purpose: 'judge',
      model,
      system: RUBRIC,
      messages: [{ role: 'user', text: `Scenario ${scenarioId}\n\n${transcript}` }],
      jsonSchema: JUDGE_SCHEMA,
      thinking: 'low',
      maxOutputTokens: 2048,
      timeoutMs: 30_000,
    });
    const raw = parseJson<Record<string, { score?: number }>>(response.text);
    const scores = { ...heuristicScores(turns) };
    for (const dimension of DIMENSIONS) {
      const score = raw[dimension]?.score;
      if (typeof score === 'number') scores[dimension] = Math.max(1, Math.min(5, Math.round(score)));
    }
    return { scores, source: 'model' };
  } catch {
    return { scores: heuristicScores(turns), source: 'heuristic' };
  }
}

export function guardOf(reply: string, move: string, channel: 'text' | 'voice', userTexts: string[]): GuardIssue[] {
  const plan: MovePlan = {
    primary: move as MovePlan['primary'],
    maxQuestions: 1,
    targetWords: channel === 'voice' ? 50 : 70,
    why: '',
  };
  const input: GuardInput = {
    reply,
    plan,
    channel,
    profile: {
      profession: 'Junior software developer at a fintech startup',
      lifestyle: 'Lives with flatmates in Manchester, plays five-a-side football',
      income: '£32k',
    },
    userTexts,
  };
  return checkReply(input);
}

export function mean(scores: Scores): number {
  const values = DIMENSIONS.map((dimension) => scores[dimension]);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
