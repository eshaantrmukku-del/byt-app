import type { CoachContextData, CoachingStage, TurnAnalysis, UserIntent } from './types.js';
import { openCommitments } from './memory.js';

const STAGES: CoachingStage[] = ['opening', 'exploring', 'awareness', 'wants', 'options', 'commitment', 'accountability', 'closing'];
const INTENTS: UserIntent[] = ['share', 'vent', 'ask_advice', 'ask_info', 'report_progress', 'decide', 'small_talk', 'push_back', 'closing', 'other'];
const OUTCOMES = ['kept', 'partial', 'missed'] as const;
const ENERGY = ['low', 'steady', 'rising'] as const;

export const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    emotions: { type: 'array', items: { type: 'string' }, description: 'Feelings present or implied, e.g. anxious, frustrated, hopeful, ashamed. Empty if none.' },
    emotionalIntensity: { type: 'integer', minimum: 0, maximum: 3, description: '0 none, 1 mild, 2 strong, 3 overwhelming' },
    topic: { type: 'string', description: 'A few words: what this is about' },
    stage: { type: 'string', enum: STAGES, description: 'Where the conversation is in the coaching arc' },
    intent: { type: 'string', enum: INTENTS },
    explicitAdviceRequest: { type: 'boolean', description: 'True only if the user directly asks for advice, tips, an answer or what they should do' },
    insightMoment: { type: 'boolean', description: 'User just voiced a new realisation about themselves' },
    commitmentStated: { type: 'boolean', description: 'User just stated an intention or commitment to act' },
    resistance: { type: 'boolean', description: 'User pushes back, deflects, dismisses the process, or says nothing will work' },
    contradiction: { type: ['string', 'null'], description: 'If the user contradicts something they said earlier (or their values vs actions), describe both sides briefly; else null' },
    assumptions: { type: 'array', items: { type: 'string' }, description: 'Limiting beliefs stated as facts, quoted or near-quoted' },
    values: { type: 'array', items: { type: 'string' }, description: 'Values implied (freedom, security, family, growth...)' },
    keyPhrase: { type: 'string', description: "Up to 8 of the user's own words that carry the most weight" },
    risk: { type: 'string', enum: ['none', 'elevated', 'crisis'], description: 'crisis = self-harm, suicide, harm to others, abuse or acute danger. elevated = hopelessness without danger.' },
    relevantGoalIds: { type: 'array', items: { type: 'string' }, description: 'IDs of listed goals directly relevant to this message' },
    useCheckIns: { type: 'boolean', description: 'Recent mood/sleep/stress check-ins would genuinely help this reply' },
    useJournal: { type: 'boolean', description: 'User refers to their journal or something they wrote' },
    referencesPastSession: { type: 'boolean', description: 'User refers to an earlier conversation or commitment' },
    goalProgressReported: {
      type: ['object', 'null'],
      properties: { goalId: { type: 'string' }, progress: { type: 'integer', minimum: 0, maximum: 100 } },
      required: ['goalId', 'progress'],
      description: 'Only if the user clearly reports concrete progress on a listed goal; estimated new progress %. Else null.',
    },
    innerCritic: { type: ['string', 'null'], description: "A harsh self-judging voice in their words (\"I'm not smart enough\", \"who am I to\"), near-quoted; else null" },
    storytelling: { type: 'boolean', description: 'A long narrative full of detail with little about what it means to them' },
    pattern: { type: ['string', 'null'], description: 'A theme, feeling or behaviour that keeps coming back across this conversation (or the previous session), with the evidence; else null. Only with real evidence.' },
    singlePerspective: { type: 'boolean', description: 'They see only one way to view it, or a forced either/or' },
    wantsIdeas: { type: 'boolean', description: 'They ask for ideas or options to consider (not a verdict on what to do)' },
    progressOutcome: { type: ['string', 'null'], description: 'If reporting back on something they committed to: "kept", "partial" or "missed"; else null' },
    commitment: {
      type: ['object', 'null'],
      properties: { action: { type: 'string' }, when: { type: ['string', 'null'] } },
      required: ['action', 'when'],
      description: 'The concrete action they just committed to, in their words, and when (as they said it); else null',
    },
    playingSmall: { type: 'boolean', description: 'Their commitment or ambition is clearly smaller than what they said they want' },
    resolvedCommitmentId: { type: ['string', 'null'], description: 'If they report on one of the listed open commitments, its id; else null' },
    allianceNote: { type: ['string', 'null'], description: 'If they say how they want to be coached (more direct, gentler, fewer questions, challenge me), a short note in their terms; else null' },
    energy: { type: 'string', enum: [...ENERGY], description: 'The energy behind the words: low (flat, heavy), steady, rising (lit up, eager)' },
    unspoken: { type: ['string', 'null'], description: 'Something that seems present but unsaid (a feeling, fear or want), as a tentative hunch; else null' },
  },
  required: [
    'emotions', 'emotionalIntensity', 'topic', 'stage', 'intent', 'explicitAdviceRequest', 'insightMoment',
    'commitmentStated', 'resistance', 'contradiction', 'assumptions', 'values', 'keyPhrase', 'risk',
    'relevantGoalIds', 'useCheckIns', 'useJournal', 'referencesPastSession', 'goalProgressReported',
    'innerCritic', 'storytelling', 'pattern', 'singlePerspective', 'wantsIdeas', 'progressOutcome', 'commitment',
    'playingSmall', 'resolvedCommitmentId', 'allianceNote', 'energy', 'unspoken',
  ],
} as const;

export const ANALYSIS_SYSTEM = `You analyse one turn of a private coaching conversation so a coach can decide how to respond. You do not reply to the user. Listen the way a skilled coach does: to their words and meaning, to the feeling and values underneath, and to the whole field (energy, hesitation, what they keep circling, what is left unsaid). Then fill in the JSON fields accurately and conservatively. Prefer the user's own words.
Every field describes the LATEST message only. Earlier messages, past sessions and their profile are there to help you understand it, never as something to flag again now: if the latest message doesn't contain an inner critic, a commitment or an assumption, those fields are empty.
Calibrate carefully; these decide the coach's next move:
- emotionalIntensity: 0 none; 1 mild or described calmly ("work feels pointless", "I'm stuck", "I'm worried"); 2 clearly upset in the moment (strong language, exclamations, "I'm furious", "I can't stand it"); 3 overwhelmed or distressed. Most messages are 0 or 1.
- intent "vent": only when they are unloading about events or people and mainly want to be heard. Describing a problem, a pattern or a fear is "share".
- innerCritic: any harsh judgement of themselves, including predictions like "I'll sound stupid", "I'll look like an idiot", "I'm not good enough".
- insightMoment: they just saw something new about themselves ("Oh. I think I...", "I've just realised", "maybe the real issue is...").
- commitmentStated / commitment: they say what they will do ("I'll...", "Next week I will..."). A conditional like "If it was one form tonight, I could do that" is stage "commitment", not yet a commitment.
- stage "wants": they say what they want or wish for ("what I actually want is...", "I'd love to..."), even mid-conversation.
- allianceNote: ONLY when they say how the coach should coach them (tone, directness, number of questions, challenge). Their own plans are never an allianceNote.
- explicitAdviceRequest: only direct requests for what to do; a request for ideas or options is wantsIdeas.
- pattern: only with evidence from more than one of their messages.
- risk "crisis": any mention of wanting to die, self-harm, harming others, abuse or immediate danger, even if phrased casually.`;

export function buildAnalysisPrompt(text: string, ctx: CoachContextData): string {
  const recent = ctx.history.slice(-8).map((m) => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.text}`).join('\n');
  const goals = ctx.goals.filter((g) => g.status !== 'completed').map((g) => `- [${g.id}] ${g.title} (${g.progress}%)`).join('\n');
  const commitments = openCommitments(ctx.memory).map((c) => `- [${c.id}] ${c.text}${c.when ? ` (by ${c.when})` : ''}`).join('\n');
  return [
    ctx.previousSessionSummary ? `Previous session (summary):\n${ctx.previousSessionSummary}` : '',
    ctx.summary ? `Earlier in this conversation (summary):\n${ctx.summary}` : '',
    recent ? `Recent messages:\n${recent}` : 'This is the first message of the conversation.',
    goals ? `User's goals:\n${goals}` : 'User has no goals listed.',
    commitments ? `Open commitments they made earlier:\n${commitments}` : '',
    `Conversation mode: ${ctx.mode === 'reflection' ? 'reflecting on recent check-ins' : 'normal'}`,
    `Latest user message:\n"""${text}"""`,
  ].filter(Boolean).join('\n\n');
}

// Deliberately broad: a false positive costs one gentle safety check, a miss costs far more.
const CRISIS = [
  /\b(kill|hurt|harm|cut)\s+(myself|me)\b/i,
  /\b(suicid|end(ing)? (it all|my life)|take my (own )?life|want(ed)? to die|wish i (was|were) dead|better off dead|no reason to live|don'?t want to (be alive|live|wake up))/i,
  /\b(overdose|self[- ]?harm)\b/i,
  /\b(kill|hurt) (him|her|them|someone|people)\b/i,
  /\b(he|she|they|partner|husband|wife|boyfriend|girlfriend) (hits|beats|chokes|hurts) me\b/i,
];

export function detectCrisis(text: string): boolean {
  return CRISIS.some((re) => re.test(text));
}

const ADVICE = /\b(what should i|should i\b|what do i do|what would you do|tell me what to do|give me (some )?(advice|tips|steps)|any (advice|tips)|how (do|can|should) i\b|what('s| is) the best way)/i;
const IDEAS = /\b(any ideas|ideas (for|on|about)|give me (some )?ideas|brainstorm|what are (some|my) options|help me (think of|come up with)|ways (to|i could))\b/i;
const CRITIC = /\b(i'?m (just |so )?(not (good|smart|clever|talented|strong|brave) enough|stupid|useless|a fraud|an idiot|pathetic|terrible at \w+|bad at \w+)|i'?ll (sound|look|feel) (so |really )?(stupid|like an idiot|like a failure|dumb|embarrassed|humiliated)|(feel|look) stupid for|i'?m not the (academic|smart|clever|sporty|creative) one|who am i to|i always (mess|screw|fuck) (it|things|everything) up|i'?ll never be (good|enough|able))/i;
const ONE_WAY = /\b(the only (way|option|choice)|no other (way|option|choice)|i (either|have to either)\b.*\bor\b|there'?s no (other )?way (out|round|around))/i;
/** Talking to or about the coach itself ("you keep asking", "can you be…", "I'd like you to…"). */
const ABOUT_COACHING = /\b(you (keep|always|never)|can you|could you|i'?d (like|prefer|rather) (you|it if you)|i want you to|i need you to|your (questions|replies|style)|coach(ing)? me)\b/i;
const ALLIANCE = /\b(be (more |a bit more )?(direct|blunt|honest|gentle|gentler|tough|tougher|harsh|harder) (with|on) me|(don'?t|stop) (sugar-?coat|being so (soft|nice)|asking so many questions)|push me|challenge me|call me out|less questions|fewer questions|just listen)\b/i;
const CLOSING = /^\s*(ok(ay)?[,.]?\s+)?(thanks|thank you|cheers|ta)\b.*\b(go|later|bye|tomorrow|night|helpful|enough|for now)\b|^\s*(i (have|need|got) to go|gotta go|got to go|talk (later|soon|tomorrow)|bye|good ?night)\b/i;
const WHEN = /\b(today|tonight|tomorrow|this (morning|afternoon|evening|week|weekend)|next week|on (monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|by \w+|before \w+)\b/i;
const MISSED = /\b(i didn'?t|i did not|i couldn'?t|i never (did|got)|i forgot|didn'?t (manage|get round|happen))\b/i;
const PARTIAL = /\b(some of|half|only (did|managed|sent)|partly|not all)\b/i;
const STOPWORDS = new Set('about after again always because before being could doing every feels going having maybe never other really right something still their there thing things think those through today would yeah which while where what when just like know want'.split(' '));

/** A content word the person keeps returning to across three or more of their messages. */
function recurringTheme(text: string, history: CoachContextData['history']): string | null {
  const messages = [...history.filter((m) => m.role === 'user').map((m) => m.text), text];
  if (messages.length < 3) return null;
  const counts = new Map<string, number>();
  for (const m of messages) {
    for (const w of new Set(m.toLowerCase().match(/[a-z']{5,}/g) ?? [])) {
      if (!STOPWORDS.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  const [word, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  return n >= 3 ? `"${word}" keeps coming up` : null;
}
// "I'll feel stupid" is a fear, not a plan: the verb after "I'll" must be something they'd do.
const COMMIT = /\b(i('ll| will)|i'm going to|i am going to|i commit|my plan is to|tomorrow i|this week i)\b(?!\s+(probably |just |only |always |never |still )?(feel|be|look|sound|seem|get|end up|fail|lose|mess|never|regret|hate|panic|freeze|cry|worry)\b)/i;
const INSIGHT = /\b(i (just )?(realis|realiz)e|oh[,.!]? (i|so)|i think i('ve| have) (just )?(seen|noticed|got it)|i never (noticed|saw|thought)|that's it[.!]|actually,? (it'?s|i'?m) (not|really))/i;
const RESIST = /\b(doesn'?t (really )?work|won'?t work|pointless|waste of time|stop asking|just answer|you don'?t get it|not helpful|i don'?t want to talk about)/i;
const PROGRESS = /\b(i did it|i (finally )?(did|finished|completed|managed|went|sent|applied|submitted)|i didn'?t (do|manage|go|get)|update:|so i (did|tried))\b/i;
const GREETING = /^(hi|hey|hello|yo|morning|good (morning|evening|afternoon)|hiya)\b[\s!.?]*$/i;
const ASSUME = /\b(i can'?t|i'?ll never|they'?ll (just )?(say no|laugh|think)|there'?s no (point|way)|i'?m (just )?not (good|smart|the type)|always|never|everyone)\b/i;

const EMOTION_WORDS: [RegExp, string, 1 | 2 | 3][] = [
  [/\b(overwhelm|drowning|can'?t cope|breaking down|falling apart)/i, 'overwhelmed', 3],
  [/\b(anxious|anxiety|panic|worried|scared|afraid|terrified|nervous)/i, 'anxious', 2],
  [/\b(sad|down|low|depressed|miserable|crying|cried|heartbroken|grief|lonely)/i, 'sad', 2],
  [/\b(angry|furious|pissed|so done|fed up|frustrat|annoyed|resent)/i, 'frustrated', 2],
  [/\b(ashamed|embarrass|guilty|useless|failure|stupid)/i, 'ashamed', 2],
  [/\b(stuck|lost|confused|torn|don'?t know what i want)/i, 'stuck', 1],
  [/\b(excited|proud|happy|relieved|hopeful|buzzing)/i, 'hopeful', 1],
  [/\b(tired|exhausted|burn(t|ed) out|drained)/i, 'exhausted', 2],
];

/**
 * Deterministic analysis used when the model call fails (and by the offline mock).
 * It is coarse on purpose; the model analysis is the real thing.
 */
export function heuristicAnalysis(text: string, ctx: CoachContextData): TurnAnalysis {
  if (text.startsWith('(The user opened')) {
    const reflection = text.includes('reflection');
    return {
      emotions: [],
      emotionalIntensity: 0,
      topic: reflection ? 'recent check-ins' : 'session opening',
      stage: 'opening',
      intent: 'small_talk',
      explicitAdviceRequest: false,
      insightMoment: false,
      commitmentStated: false,
      resistance: false,
      contradiction: null,
      assumptions: [],
      values: [],
      keyPhrase: '',
      risk: 'none',
      relevantGoalIds: [],
      useCheckIns: reflection,
      useJournal: reflection,
      referencesPastSession: false,
      goalProgressReported: null,
      ...QUIET_SIGNALS,
    };
  }
  const lower = text.toLowerCase();
  const emotions: string[] = [];
  let intensity: 0 | 1 | 2 | 3 = 0;
  for (const [re, name, level] of EMOTION_WORDS) {
    if (re.test(text)) {
      emotions.push(name);
      if (level > intensity) intensity = level;
    }
  }
  if (/!{2,}|\b(really|so|completely) (hard|bad|awful)\b/i.test(text) && intensity < 3) intensity = Math.max(intensity, 2) as 2;
  const crisis = detectCrisis(text);
  const advice = ADVICE.test(text);
  const insight = INSIGHT.test(text);
  const resistance = RESIST.test(text);
  const progress = PROGRESS.test(text);
  const greeting = GREETING.test(text.trim());
  const closing = CLOSING.test(text) && !advice;
  const critic = text.match(CRITIC)?.[0] ?? null;
  // "I'll sound stupid" is the critic talking, not a plan.
  const commitment = COMMIT.test(text) && !/\?\s*$/.test(text) && !critic;
  const outcome = progress ? (MISSED.test(text) ? 'missed' : PARTIAL.test(text) ? 'partial' : 'kept') : null;
  const open = openCommitments(ctx.memory);
  const assumptions = ASSUME.test(text) ? [text.match(ASSUME)![0]] : [];
  const coachTurns = ctx.history.filter((m) => m.role === 'coach').length;

  let stage: CoachingStage = coachTurns === 0 ? 'opening' : coachTurns < 3 ? 'exploring' : 'awareness';
  if (commitment) stage = 'commitment';
  else if (progress) stage = 'accountability';
  else if (/\bi could (do|manage|handle) (that|this|it)\b/i.test(text)) stage = 'commitment';
  else if (/\b(i (really |actually |just )?want|i'd (really )?love|ideally)\b/i.test(text)) stage = 'wants';
  else if (/\b(options|could either|or i could|choose|decide|decision)\b/i.test(text)) stage = 'options';

  let intent: UserIntent = 'share';
  if (greeting) intent = 'small_talk';
  else if (closing) intent = 'closing';
  else if (advice) intent = 'ask_advice';
  else if (progress) intent = 'report_progress';
  else if (resistance) intent = 'push_back';
  else if (/\b(decide|decision|choose|torn between)\b/i.test(text)) intent = 'decide';
  else if (intensity >= 2) intent = 'vent';

  const relevantGoalIds = ctx.goals
    .filter((g) => g.status !== 'completed')
    .filter((g) => g.title.toLowerCase().split(/\W+/).some((w) => w.length > 3 && lower.includes(w)))
    .map((g) => g.id);

  const earlierUser = ctx.history.filter((m) => m.role === 'user').map((m) => m.text.toLowerCase()).join(' ');
  let contradiction: string | null = null;
  if (/\bnot (sure|anymore)|actually i (don'?t|do)|changed my mind|on second thought/i.test(text) && earlierUser) {
    contradiction = 'User appears to reverse something said earlier';
  }

  const words = text.replace(/[^\w\s']/g, '').split(/\s+/).filter(Boolean);
  return {
    emotions,
    emotionalIntensity: crisis ? 3 : intensity,
    topic: words.slice(0, 6).join(' ') || 'general',
    stage,
    intent,
    explicitAdviceRequest: advice,
    insightMoment: insight,
    commitmentStated: commitment,
    resistance,
    contradiction,
    assumptions,
    values: [],
    keyPhrase: words.slice(-8).join(' '),
    risk: crisis ? 'crisis' : intensity === 3 ? 'elevated' : 'none',
    relevantGoalIds,
    useCheckIns: ctx.mode === 'reflection' || /\b(sleep|mood|stress|energy|tired|check-?in)/i.test(text),
    useJournal: /\bjournal|wrote|writing\b/i.test(text),
    referencesPastSession: /\b(last time|we talked|you asked|i said i'?d|as i mentioned)\b/i.test(text),
    goalProgressReported: null,
    innerCritic: critic,
    storytelling: words.length > 150 && intensity <= 1,
    pattern: recurringTheme(text, ctx.history),
    singlePerspective: ONE_WAY.test(text),
    wantsIdeas: IDEAS.test(text),
    progressOutcome: outcome,
    commitment: commitment ? { action: text.trim().slice(0, 160), when: text.match(WHEN)?.[0] ?? null } : null,
    playingSmall: false,
    resolvedCommitmentId: outcome && open.length === 1 ? open[0]!.id : null,
    allianceNote: ALLIANCE.test(text) ? text.match(ALLIANCE)![0] : null,
    energy: intensity >= 2 || /\b(tired|flat|meh|whatever)\b/i.test(text) ? 'low' : /\b(excited|can'?t wait|buzzing|finally)\b|!/i.test(text) ? 'rising' : 'steady',
    unspoken: null,
  };
}

const QUIET_SIGNALS = {
  innerCritic: null,
  storytelling: false,
  pattern: null,
  singlePerspective: false,
  wantsIdeas: false,
  progressOutcome: null,
  commitment: null,
  playingSmall: false,
  resolvedCommitmentId: null,
  allianceNote: null,
  energy: 'steady',
  unspoken: null,
} as const satisfies Partial<TurnAnalysis>;

/** Coerces model output into a valid analysis, filling gaps from the heuristic one. */
export function normaliseAnalysis(
  raw: unknown,
  fallback: TurnAnalysis,
  validGoalIds: ReadonlySet<string>,
  validCommitmentIds: ReadonlySet<string> = new Set(),
): TurnAnalysis {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, d: string) => (typeof v === 'string' ? v.slice(0, 200) : d);
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const strs = (v: unknown, d: string[]) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 6).map((s) => s.slice(0, 120)) : d);
  const intensity = typeof r.emotionalIntensity === 'number' ? Math.max(0, Math.min(3, Math.round(r.emotionalIntensity))) : fallback.emotionalIntensity;
  const risk = r.risk === 'crisis' || r.risk === 'elevated' || r.risk === 'none' ? r.risk : fallback.risk;
  const gp = r.goalProgressReported as { goalId?: unknown; progress?: unknown } | null | undefined;
  const goalProgressReported =
    gp && typeof gp.goalId === 'string' && validGoalIds.has(gp.goalId) && typeof gp.progress === 'number'
      ? { goalId: gp.goalId, progress: Math.max(0, Math.min(100, Math.round(gp.progress))) }
      : null;
  return {
    emotions: strs(r.emotions, fallback.emotions),
    emotionalIntensity: intensity as 0 | 1 | 2 | 3,
    topic: str(r.topic, fallback.topic),
    stage: readStage(r.stage, fallback.stage),
    intent: INTENTS.includes(r.intent as UserIntent) ? (r.intent as UserIntent) : fallback.intent,
    explicitAdviceRequest: bool(r.explicitAdviceRequest, fallback.explicitAdviceRequest),
    insightMoment: bool(r.insightMoment, fallback.insightMoment),
    commitmentStated: bool(r.commitmentStated, fallback.commitmentStated),
    resistance: bool(r.resistance, fallback.resistance),
    contradiction: typeof r.contradiction === 'string' && r.contradiction.trim() ? r.contradiction.slice(0, 300) : null,
    assumptions: strs(r.assumptions, fallback.assumptions),
    values: strs(r.values, fallback.values),
    keyPhrase: str(r.keyPhrase, fallback.keyPhrase),
    // The regex check can only raise risk, never lower what the model saw.
    risk: fallback.risk === 'crisis' ? 'crisis' : risk,
    relevantGoalIds: strs(r.relevantGoalIds, fallback.relevantGoalIds).filter((id) => validGoalIds.has(id)),
    useCheckIns: bool(r.useCheckIns, fallback.useCheckIns),
    useJournal: bool(r.useJournal, fallback.useJournal),
    referencesPastSession: bool(r.referencesPastSession, fallback.referencesPastSession),
    goalProgressReported,
    innerCritic: nullableStr(r.innerCritic, fallback.innerCritic),
    storytelling: bool(r.storytelling, fallback.storytelling),
    pattern: nullableStr(r.pattern, fallback.pattern),
    singlePerspective: bool(r.singlePerspective, fallback.singlePerspective),
    wantsIdeas: bool(r.wantsIdeas, fallback.wantsIdeas),
    progressOutcome: OUTCOMES.includes(r.progressOutcome as never) ? (r.progressOutcome as TurnAnalysis['progressOutcome']) : r.progressOutcome === null ? null : fallback.progressOutcome,
    commitment: readCommitment(r.commitment, fallback.commitment),
    playingSmall: bool(r.playingSmall, fallback.playingSmall),
    resolvedCommitmentId:
      typeof r.resolvedCommitmentId === 'string' && validCommitmentIds.has(r.resolvedCommitmentId) ? r.resolvedCommitmentId : fallback.resolvedCommitmentId,
    allianceNote: nullableStr(r.allianceNote, fallback.allianceNote),
    energy: ENERGY.includes(r.energy as never) ? (r.energy as TurnAnalysis['energy']) : fallback.energy,
    unspoken: nullableStr(r.unspoken, fallback.unspoken),
  };
}

/** An explicitly stated want outranks a model that still files the turn under exploring. */
function readStage(v: unknown, d: CoachingStage): CoachingStage {
  if (!STAGES.includes(v as CoachingStage)) return d;
  const early = v === 'opening' || v === 'exploring' || v === 'awareness';
  return d === 'wants' && early ? 'wants' : (v as CoachingStage);
}

const STOP = new Set(['that', 'this', 'with', 'they', 'them', 'then', 'will', 'just', 'have', 'been', 'from', 'what', 'when', 'your', 'about', 'feel', 'really', 'because', 'would', 'could', 'there', 'their', 'into', 'like']);
/** Significant words, lower-cased, apostrophes normalised. */
export function contentWords(s: string): string[] {
  return (s.toLowerCase().replace(/[‘’]/g, "'").match(/[a-z']{4,}/g) ?? []).filter((w) => !STOP.has(w));
}

/** True when most of a phrase's significant words appear in the text. */
function groundedIn(phrase: string, text: string): boolean {
  const words = contentWords(phrase);
  if (words.length === 0) return true;
  const have = new Set(contentWords(text));
  return words.filter((w) => have.has(w)).length / words.length >= 0.5;
}

/**
 * The inner critic and assumptions must come from the latest message. Models tend to
 * re-flag things from earlier sessions, and the coach then quotes words they never said today.
 */
export function groundInLatest(a: TurnAnalysis, text: string): TurnAnalysis {
  return {
    ...a,
    innerCritic: a.innerCritic && groundedIn(a.innerCritic, text) ? a.innerCritic : null,
    assumptions: a.assumptions.filter((x) => groundedIn(x, text)),
    // A note about how to coach them needs them to be talking about the coaching.
    allianceNote: a.allianceNote && (ALLIANCE.test(text) || ABOUT_COACHING.test(text)) ? a.allianceNote : null,
  };
}

/** A string field the model may leave null; a missing field keeps the fallback. */
function nullableStr(v: unknown, d: string | null): string | null {
  if (typeof v === 'string') return v.trim() ? v.trim().slice(0, 200) : null;
  return v === null ? null : d;
}

function readCommitment(v: unknown, d: TurnAnalysis['commitment']): TurnAnalysis['commitment'] {
  if (v === null) return null;
  const c = v as { action?: unknown; when?: unknown } | undefined;
  if (!c || typeof c.action !== 'string' || !c.action.trim()) return d;
  return { action: c.action.trim().slice(0, 160), when: typeof c.when === 'string' && c.when.trim() ? c.when.trim().slice(0, 60) : null };
}
