import type { CoachContextData, CoachingStage, TurnAnalysis, UserIntent } from './types.js';

const STAGES: CoachingStage[] = ['opening', 'exploring', 'awareness', 'wants', 'options', 'commitment', 'accountability', 'closing'];
const INTENTS: UserIntent[] = ['share', 'vent', 'ask_advice', 'ask_info', 'report_progress', 'decide', 'small_talk', 'push_back', 'other'];

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
  },
  required: [
    'emotions', 'emotionalIntensity', 'topic', 'stage', 'intent', 'explicitAdviceRequest', 'insightMoment',
    'commitmentStated', 'resistance', 'contradiction', 'assumptions', 'values', 'keyPhrase', 'risk',
    'relevantGoalIds', 'useCheckIns', 'useJournal', 'referencesPastSession', 'goalProgressReported',
  ],
} as const;

export const ANALYSIS_SYSTEM = `You analyse one turn of a private coaching conversation so a coach can decide how to respond. You do not reply to the user. Read the recent conversation and the latest user message, then fill in the JSON fields accurately and conservatively. Prefer the user's own words. Mark explicitAdviceRequest only for direct requests. Mark risk "crisis" for any mention of wanting to die, self-harm, harming others, abuse or immediate danger, even if phrased casually.`;

export function buildAnalysisPrompt(text: string, ctx: CoachContextData): string {
  const recent = ctx.history.slice(-8).map((m) => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.text}`).join('\n');
  const goals = ctx.goals.filter((g) => g.status !== 'completed').map((g) => `- [${g.id}] ${g.title} (${g.progress}%)`).join('\n');
  return [
    ctx.summary ? `Earlier in this conversation (summary):\n${ctx.summary}` : '',
    recent ? `Recent messages:\n${recent}` : 'This is the first message of the conversation.',
    goals ? `User's goals:\n${goals}` : 'User has no goals listed.',
    `Conversation mode: ${ctx.mode === 'reflection' ? 'reflecting on recent check-ins' : 'normal'}`,
    `Latest user message:\n"""${text}"""`,
  ].filter(Boolean).join('\n\n');
}

// Deliberately broad: a false positive costs one gentle safety check, a miss costs far more.
const CRISIS = [
  /\b(kill|hurt|harm|cut)\s+(myself|me)\b/i,
  /\b(suicid|end (it all|my life)|take my (own )?life|want(ed)? to die|wish i (was|were) dead|better off dead|no reason to live|don'?t want to (be alive|live|wake up))/i,
  /\b(overdose|self[- ]?harm)\b/i,
  /\b(kill|hurt) (him|her|them|someone|people)\b/i,
  /\b(he|she|they|partner|husband|wife|boyfriend|girlfriend) (hits|beats|chokes|hurts) me\b/i,
];

export function detectCrisis(text: string): boolean {
  return CRISIS.some((re) => re.test(text));
}

const ADVICE = /\b(what should i|should i\b|what do i do|what would you do|tell me what to do|give me (some )?(advice|tips|ideas|steps)|any (advice|tips|ideas)|how (do|can|should) i\b|what('s| is) the best way)/i;
const COMMIT = /\b(i('ll| will)|i'm going to|i am going to|i commit|my plan is to|tomorrow i|this week i)\b/i;
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
  const commitment = COMMIT.test(text) && !/\?\s*$/.test(text);
  const insight = INSIGHT.test(text);
  const resistance = RESIST.test(text);
  const progress = PROGRESS.test(text);
  const greeting = GREETING.test(text.trim());
  const assumptions = ASSUME.test(text) ? [text.match(ASSUME)![0]] : [];
  const coachTurns = ctx.history.filter((m) => m.role === 'coach').length;

  let stage: CoachingStage = coachTurns === 0 ? 'opening' : coachTurns < 3 ? 'exploring' : 'awareness';
  if (commitment) stage = 'commitment';
  else if (progress) stage = 'accountability';
  else if (/\b(i want|i'd love|what i really want|ideally)\b/i.test(text)) stage = 'wants';
  else if (/\b(options|could either|or i could|choose|decide|decision)\b/i.test(text)) stage = 'options';

  let intent: UserIntent = 'share';
  if (greeting) intent = 'small_talk';
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
  };
}

/** Coerces model output into a valid analysis, filling gaps from the heuristic one. */
export function normaliseAnalysis(raw: unknown, fallback: TurnAnalysis, validGoalIds: ReadonlySet<string>): TurnAnalysis {
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
    stage: STAGES.includes(r.stage as CoachingStage) ? (r.stage as CoachingStage) : fallback.stage,
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
  };
}
