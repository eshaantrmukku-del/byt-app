import type { Channel } from '../contract.js';
import { contentWords } from './analysis.js';
import type { GuardIssue, MovePlan, ProfileContext } from './types.js';

const PRAISE = /^\s*(great|perfect|excellent|nice|love it)[.!,]|\b(great job|well done|amazing|incredible|fantastic|awesome|brilliant|wonderful|so proud|proud of you|great question|good question|love that|you('re| are) (doing )?(great|amazing|so brave)|that's (great|amazing|wonderful|fantastic|brilliant))\b/i;
const DIRECTIVE = /\byou (really |definitely |absolutely )?(should|must|need to|have to|ought to|gotta)\b|\bhave you tried\b|\bmake sure (you|to)\b/gi;
const LIST_LINE = /^\s*(?:[-*•‣▪]|\d+[.)]|[a-z][.)])\s+/m;
const MARKDOWN = /\*\*|__|^#{1,6}\s|`/m;
const HUMAN_CLAIM = /\b(when i was (younger|your age|a)|i('ve| have) been there|in my experience as a (person|human)|i remember when i|my (wife|husband|kids|family|childhood))\b/i;
const META = /\b(co-?active|powerful question|as your (ai )?coach,? i('m| am) going to|coaching (model|technique|framework))\b/i;
const WHY_QUESTION = /(^|[.!?]\s+|,\s*)(but |and |so )?why\b[^.!?]*\?/i;
const CLOSED_START = /^(do|does|did|is|are|was|were|have|has|had|can|could|would|will|should|shall|am)\b/i;
const LEADING = /\bhow about (you|we|committing|trying|starting|making)\b|\bhave you (considered|thought about|tried)\b|\bwhat if you (just|tried|simply)\b|\bwouldn'?t it be (better|easier|good)\b|\bdon'?t you think\b|\bisn'?t it (possible|true) that\b/i;
/** A statement that opens with an instruction ("Decide…", "Write it down…"). */
const IMPERATIVE = /(^|,\s*)(decide|write|note|notice|jot|try|make|start|set|commit|plan|pick|choose|schedule|block|take(?! your time)|focus|remember|keep|stop|go|get|put|list|prepare|practise|practice|aim)\b/i;
/** Using what they've done as proof of what they can do ("you've already shown…"). */
const EVIDENCE = /\b(you'?ve (already )?(shown|proven|proved|demonstrated|started|built|done|managed|kept)|you already (have|do|did)|(proves?|shows?) (that )?you can|evidence that you|i can see you (have|'?ve|are))\b/i;
/** A statement that still invites them to go on, so a reply without a question isn't a dead end. */
const OPENING = /\b(curious|wonder|if you('d)? (want|like)|tell me|i'?m here|happy to|we can|no rush|take your time|stay with|say more|hear more|whenever you|feel free|open to)\b/i;
const NEEDS_OPENING = new Set(['reflect_and_deepen', 'acknowledge_and_explore', 'name_inner_critic', 'deepen_insight', 'explore_perspectives', 'bottom_line', 'challenge_assumption', 'acknowledge']);
/** A plan suggested to them ("Maybe you could choose one small action, like…"). */
const SUGGESTING = /\b(maybe|perhaps) you could\b|\byou could (try|choose|start|write|pick|set|decide|make|begin|send|book|schedule)\b|\bwhy not (try|just)\b/i;
/** Talk of steps while they're still exploring or feeling it. */
const STEP_TALK = /\b(small|tiny|little|first|next|one) (step|action)s?\b/i;
const EXPLORING_MOVES = new Set([
  'reflect_and_deepen', 'acknowledge_and_explore', 'clearing', 'name_inner_critic', 'bottom_line', 'explore_values',
  'explore_perspectives', 'offer_intuition', 'powerful_question', 'challenge_assumption', 'name_contradiction', 'explore_resistance',
]);
/** Describing them like a case study ("touches on your desire to be valued", "a stand-in for that old narrative"). */
const ANALYTICAL = /\b(touches on|speaks to|taps into|points to) (your|a|the) (deep(er)? |underlying |core )?(desire|need|longing|value|wish|fear)s?\b|\byour (deep(er)? )?(desire|need|longing) (to be|for)\b|\b(stand-?in|proxy) for\b|\bnarrative\b|\b(protective|defen[cs]e|coping) mechanism\b|\b(core|underlying) (belief|value|need|wound)s?\b|\bsense of (self-?)?worth\b/i;
/** Analytical "clash between growth and safety" framing; naming a contradiction is that move's job. */
const ABSTRACT_TENSION = /\b(clash|tension|conflict|pull|tug) between\b/i;
/** Telling them what they're noticing, rather than reflecting what they said. */
const NOTICING = /(^|[.!?]\s+)(you('re| are) noticing|you notice)\b|\blet you notice\b/i;
/** Questions about bodily sensations read as therapy-speak in an app; feelings are asked about directly. */
const BODY = /\b(in|through) your body\b|\bbodily\b|\bphysical sensations?\b/i;
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
  /** The coach's last few replies, to catch it repeating itself. */
  coachTexts?: string[];
  /** Titles of their goals, so the coach doesn't rename what they said after one. */
  goalTitles?: string[];
};

/** Moves where naming a goal is the point (greeting, following up on a commitment). */
const GOAL_TALK_MOVES = new Set(['open_session', 'accountability_check', 'move_to_action', 'make_request']);
/** Words match on their first five letters, so "applying" covers "apply". */
const stem = (w: string) => w.slice(0, 5);

/** Stock phrases that make a coach sound like a template when they recur. */
const FORMULAS = ['it sounds like', 'what do you notice', 'what else', "you're noticing", 'i hear', "what's coming up", 'what is coming up', 'what does that', 'in your body'];
/** Openings that all mirror them back the same way ("You're noticing…", "You sense…", "It sounds like…"). */
const MIRROR_OPENING = /^(it sounds like|it seems|i hear|i'm hearing|you('re| are) (\w+ing|holding|caught)|you (sense|seem|feel)\b)/;
/** Two questions joined into one ("What would that look like, and how would you feel?"). */
const COMPOUND_QUESTION = /[,—–-]\s*and (what|how|when|by when|who|where|which)(\s+[^\s?.!]+){4,}\s*\?/i;
const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
const opener = (s: string) => norm(s).split(' ').slice(0, 3).join(' ');

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
  const maxQ = channel === 'voice' ? Math.min(1, plan.maxQuestions) : plan.maxQuestions;
  if (plan.maxQuestions === 0 && q > 0 && !safety) {
    issues.push({ check: 'questions', severity: 'block', detail: 'Asks a question after a run of questions. Let this reply land as a statement.' });
  } else if (q > maxQ + 1 || (channel === 'voice' && q > 1)) {
    issues.push({ check: 'questions', severity: 'block', detail: `Asks ${q} questions. Ask only one.` });
  } else if (q > maxQ) {
    issues.push({ check: 'questions', severity: 'warn', detail: `Asks ${q} questions; one is usually better.` });
  }
  if (q === 0 && !safety && NEEDS_OPENING.has(plan.primary) && !OPENING.test(reply)) {
    issues.push({ check: 'no-invitation', severity: 'block', detail: 'Ends without a question or an opening, so the conversation stalls. Leave a gentle door open ("I\'d be curious…", "Take your time with that…").' });
  } else if (q === 0 && !safety && plan.maxQuestions > 0 && !OPENING.test(reply)) {
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
  if (echoed.length >= 2 || (echoed.length === 1 && (plan.primary === 'open_session' || EVIDENCE.test(reply)))) {
    issues.push({ check: 'profile-recital', severity: 'block', detail: `Recites profile details they didn't bring up ("${echoed[0]}"). Use background quietly.` });
  }

  // "The university application" when they said "the course": a goal's name, not theirs.
  if (!safety && !GOAL_TALK_MOVES.has(plan.primary) && input.goalTitles?.length) {
    const heardStems = new Set(contentWords(input.userTexts.join(' ')).map(stem));
    const replyWords = new Set(contentWords(reply));
    const renamed = input.goalTitles.flatMap(contentWords).find((w) => replyWords.has(w) && !heardStems.has(stem(w)));
    if (renamed) {
      issues.push({ check: 'renamed', severity: 'block', detail: `Calls it "${renamed}", from a goal's title, when they didn't. Use the words they used.` });
    }
  }

  const previous = (input.coachTexts ?? []).map(norm);
  if (previous.length && !safety) {
    const mine = norm(reply);
    const latest = previous[previous.length - 1] ?? '';
    const sameOpening = previous.some((p) => opener(p) === opener(reply)) || (MIRROR_OPENING.test(mine) && MIRROR_OPENING.test(latest));
    const reused = FORMULAS.find((f) => mine.includes(f) && previous.some((p) => p.includes(f)));
    if (sameOpening || reused) {
      issues.push({ check: 'repetition', severity: 'block', detail: `Repeats ${reused ? `"${reused}"` : 'the opening'} from a recent reply. Say it differently.` });
    }
  }
  // One mirror is a reflection; two in a row inside one reply is a template.
  const mirrors = reply.split(/(?<=[.!?])\s+/).filter((x) => MIRROR_OPENING.test(norm(x))).length;
  if (!safety && mirrors >= 2) {
    issues.push({ check: 'repetition', severity: 'block', detail: 'Mirrors them twice in one reply ("You\'re sensing… It sounds like…"). Reflect once, then add something new.' });
  }
  if (!safety && COMPOUND_QUESTION.test(reply)) {
    issues.push({ check: 'questions', severity: 'block', detail: 'Joins two questions with "and". Ask just the one that matters most.' });
  }
  if (!safety && !ADVISING_MOVES.has(plan.primary) && plan.primary !== 'make_request' && SUGGESTING.test(reply)) {
    issues.push({ check: 'suggesting', severity: 'block', detail: 'Suggests what they could do. Help them find their own next step instead.' });
  }
  if (EXPLORING_MOVES.has(plan.primary) && STEP_TALK.test(reply)) {
    issues.push({ check: 'premature-action', severity: 'block', detail: "Pushes towards a step while they're still exploring. Stay with what they're telling you." });
  }
  // "You've already started BYT and keep up the gym" about things they didn't say here: borrowed evidence.
  const evidence = reply.split(/(?<=[.!?])\s+/).find((x) => EVIDENCE.test(x));
  if (!safety && evidence) {
    const heard = new Set(contentWords(input.userTexts.join(' ')));
    const borrowed = contentWords(evidence.replace(EVIDENCE, '')).filter((w) => !heard.has(w));
    if (borrowed.length >= 2) {
      issues.push({ check: 'borrowed-evidence', severity: 'block', detail: `Uses things they didn't say here as proof of what they can do ("${evidence.slice(0, 60)}"). Only use what they told you in this conversation.` });
    }
  }
  const analytical = reply.match(ANALYTICAL) ?? (plan.primary !== 'name_contradiction' ? reply.match(ABSTRACT_TENSION) : null);
  if (!safety && analytical) {
    issues.push({ check: 'analytical', severity: 'block', detail: `Describes them like an analyst ("${analytical[0]}"). Say it the plain, human way, in their own words.` });
  }
  if (!safety && NOTICING.test(reply)) {
    issues.push({ check: 'noticing', severity: 'block', detail: 'Tells them what they\'re noticing. Reflect what they actually said instead.' });
  }
  if (!safety && BODY.test(reply)) {
    issues.push({ check: 'body', severity: 'block', detail: 'Asks about bodily sensations. Talk about how it feels or what it means to them instead.' });
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
  const instruction = reply
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .find((x) => !x.endsWith('?') && IMPERATIVE.test(x));
  if (!safety && !ADVISING_MOVES.has(plan.primary) && plan.primary !== 'make_request' && instruction) {
    issues.push({ check: 'instructing', severity: 'block', detail: `Gives them an instruction ("${instruction.slice(0, 50)}"). Ask instead; let them design their own plan.` });
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
