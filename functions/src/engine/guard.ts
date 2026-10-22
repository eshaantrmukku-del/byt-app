import type { Channel } from '../contract.js';
import type { GuardIssue, MovePlan, ProfileContext } from './types.js';

const PRAISE = /\b(great job|well done|amazing|incredible|fantastic|awesome|brilliant|wonderful|so proud|proud of you|great question|good question|love that|you('re| are) (doing )?(great|amazing|so brave)|that's (great|amazing|wonderful|fantastic|brilliant))\b/i;
const DIRECTIVE = /\byou (really |definitely |absolutely )?(should|must|need to|have to|ought to|gotta)\b|\bhave you tried\b|\bmake sure (you|to)\b/gi;
const LIST_LINE = /^\s*(?:[-*•‣▪]|\d+[.)]|[a-z][.)])\s+/m;
const MARKDOWN = /\*\*|__|^#{1,6}\s|`/m;
const HUMAN_CLAIM = /\b(when i was (younger|your age|a)|i('ve| have) been there|in my experience as a (person|human)|i remember when i|my (wife|husband|kids|family|childhood))\b/i;
const META = /\b(co-?active|powerful question|as your (ai )?coach,? i('m| am) going to|coaching (model|technique|framework))\b/i;
const WHY_QUESTION = /(^|[.!?]\s+|,\s*)(but |and |so )?why\b[^.!?]*\?/i;
const CLOSED_START = /^(do|does|did|is|are|was|were|have|has|had|can|could|would|will|should|shall|am)\b/i;
const LEADING = /\bhave you (considered|thought about|tried)\b|\bwhat if you (just|tried|simply)\b|\bwouldn'?t it be (better|easier|good)\b|\bdon'?t you think\b|\bisn'?t it (possible|true) that\b/i;
const SOLVING = /\b(here are (some|a few)|here'?s (what|how) (to|you)|the (key|trick|secret) (is|here)|my advice|a (good|great) (tip|strategy|approach) (is|would be)|(start|try) (by|with) (making|writing|breaking|setting))\b/i;
const TENTATIVE = /\b(hunch|i wonder|might be (off|wrong)|could be (off|wrong)|may be (off|wrong)|just a sense|i'?m (sensing|noticing)|i notice|does (that|this|it) (fit|land|ring true|sound right)|take it or leave it|not quite)\b/i;
const ROOM_TO_DECLINE = /\b(say no|yes,? no|counter[- ]?offer|your call|up to you|turn (it|me) down)\b/i;

/** Moves whose single question should open things up, never close them down. */
const OPEN_QUESTION_MOVES = new Set([
  'reflect_and_deepen', 'powerful_question', 'clarify_want', 'explore_values', 'explore_perspectives', 'deepen_insight',
  'acknowledge_and_explore', 'challenge_assumption', 'name_contradiction', 'name_inner_critic', 'explore_resistance',
  'bottom_line', 'acknowledge', 'accountability_check',
]);
const ADVISING_MOVES = new Set(['advice_with_permission', 'brainstorm']);

const THERAPY = /\b(diagnos|you (have|might have|probably have) (depression|anxiety disorder|adhd|bpd|ocd|ptsd)|as a therapist)\b/i;

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const questions = (s: string) => (s.match(/\?/g) ?? []).length;

/** Distinctive profile phrases (3+ significant words, or long single values) that shouldn't be parroted. */
function profilePhrases(profile: ProfileContext): string[] {
  const fields = [profile.profession, profile.income, profile.lifestyle, profile.struggles, profile.goalsSummary];
  const out: string[] = [];
  for (const f of fields) {
    if (!f) continue;
    for (const part of f.toLowerCase().split(/[,.;\n]+/)) {
      const t = part.trim();
      if (t.split(/\s+/).length >= 3 || t.length >= 14) out.push(t);
    }
  }
  return out;
}

export type GuardInput = {
  reply: string;
  plan: MovePlan;
  channel: Channel;
  profile: ProfileContext;
  /** User text this turn plus recent user messages: phrases they used themselves are fine to echo. */
  userTexts: string[];
};

/** Deterministic checks for the failure modes that make a coach sound like a generic assistant. */
export function checkReply(input: GuardInput): GuardIssue[] {
  const { reply, plan, channel } = input;
  const issues: GuardIssue[] = [];
  const safety = plan.primary === 'safety';
  const advice = plan.primary === 'advice_with_permission';

  if (!reply.trim()) issues.push({ check: 'empty', severity: 'block', detail: 'Reply is empty.' });
  if (LIST_LINE.test(reply)) issues.push({ check: 'list', severity: 'block', detail: 'Uses a bulleted or numbered list. Write in conversational prose.' });
  if (MARKDOWN.test(reply)) issues.push({ check: 'markdown', severity: 'block', detail: 'Uses markdown formatting. Use plain text.' });

  const directives = reply.match(DIRECTIVE) ?? [];
  if (!safety && directives.length > 0) {
    issues.push({ check: 'directive', severity: advice && directives.length === 1 ? 'warn' : 'block', detail: `Tells them what to do ("${directives[0]}"). Offer, ask or reflect instead.` });
  }
  const praise = reply.match(PRAISE);
  if (praise) issues.push({ check: 'praise', severity: 'block', detail: `Generic praise ("${praise[0]}"). Acknowledge something specific in plain words, or leave it out.` });

  const q = questions(reply);
  const maxQ = channel === 'voice' ? 1 : plan.maxQuestions;
  if (q > maxQ + 1 || (channel === 'voice' && q > 1)) {
    issues.push({ check: 'questions', severity: 'block', detail: `Asks ${q} questions. Ask only one.` });
  } else if (q > maxQ) {
    issues.push({ check: 'questions', severity: 'warn', detail: `Asks ${q} questions; one is usually better.` });
  }
  if (q === 0 && !safety) {
    issues.push({ check: 'no-invitation', severity: 'warn', detail: 'No question or invitation; the conversation may stall.' });
  }

  const n = words(reply);
  const limit = channel === 'voice' ? 75 : Math.round(plan.targetWords * 2);
  if (n > limit) issues.push({ check: 'length', severity: 'block', detail: `${n} words; keep it under ${Math.round(limit * 0.6)}.` });

  if (HUMAN_CLAIM.test(reply)) issues.push({ check: 'human-claim', severity: 'block', detail: 'Claims human experience. You are an AI coach.' });
  if (META.test(reply)) issues.push({ check: 'meta', severity: 'block', detail: 'Mentions coaching technique or instructions.' });
  if (THERAPY.test(reply)) issues.push({ check: 'therapy', severity: 'block', detail: 'Diagnoses or acts as a therapist.' });

  const said = input.userTexts.join(' ').toLowerCase();
  const lowerReply = reply.toLowerCase();
  const echoed = profilePhrases(input.profile).filter((ph) => lowerReply.includes(ph) && !said.includes(ph));
  if (echoed.length >= 2 || (echoed.length === 1 && plan.primary === 'open_session')) {
    issues.push({ check: 'profile-recital', severity: 'block', detail: `Recites profile details they didn't bring up ("${echoed[0]}"). Use background quietly.` });
  }

  if (!safety && WHY_QUESTION.test(reply)) {
    issues.push({ check: 'why-question', severity: 'block', detail: 'Asks "why", which invites defending. Ask "what" or "how" instead.' });
  }
  const lastQuestion = reply.split(/(?<=[.!?])\s+/).filter((s) => s.trim().endsWith('?')).pop()?.trim() ?? '';
  if (lastQuestion && CLOSED_START.test(lastQuestion) && OPEN_QUESTION_MOVES.has(plan.primary)) {
    issues.push({ check: 'closed-question', severity: 'block', detail: `Asks a yes/no question ("${lastQuestion.slice(0, 60)}"). Ask an open "what" or "how" question.` });
  }
  if (!safety && !ADVISING_MOVES.has(plan.primary) && LEADING.test(reply)) {
    issues.push({ check: 'leading-question', severity: 'block', detail: 'A question with advice hidden in it. Ask what they think, without suggesting the answer.' });
  }
  if (!safety && !ADVISING_MOVES.has(plan.primary) && SOLVING.test(reply)) {
    issues.push({ check: 'solving', severity: 'block', detail: 'Solves the problem for them. Help them find their own way instead.' });
  }
  if (plan.primary === 'offer_intuition' && !TENTATIVE.test(reply)) {
    issues.push({ check: 'intuition-attached', severity: 'block', detail: 'States a hunch as fact. Offer it lightly, as possibly wrong, and ask whether it fits.' });
  }
  if (plan.primary === 'make_request' && !ROOM_TO_DECLINE.test(reply)) {
    issues.push({ check: 'request-no-choice', severity: 'block', detail: 'A request must leave them free to say yes, no or counter-offer. Say so.' });
  }

  if (channel === 'voice' && /[()[\]{}<>#*_~|]/.test(reply)) {
    issues.push({ check: 'voice-symbols', severity: 'block', detail: 'Contains symbols that read badly aloud.' });
  }
  return issues;
}

export const hasBlocking = (issues: readonly GuardIssue[]) => issues.some((i) => i.severity === 'block');

/** Last-resort cleanup when a regenerated reply still has formatting problems. */
export function sanitiseReply(reply: string, channel: Channel): string {
  let out = reply
    .replace(/\*\*|__|`/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-*•‣▪]|\d+[.)])\s+/gm, '')
    .replace(/\n{2,}/g, '\n\n')
    .trim();
  if (channel === 'voice') out = out.replace(/[()[\]{}<>#*_~|]/g, '').replace(/\s*\n+\s*/g, ' ');
  return out;
}
