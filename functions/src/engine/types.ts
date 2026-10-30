import type { Channel, ConversationMode, GoalProgressProposal } from '../contract.js';

export type ProfileContext = {
  displayName?: string;
  dateOfBirth?: string | null;
  profession?: string;
  goalsSummary?: string;
  income?: string;
  lifestyle?: string;
  struggles?: string;
  coachNotes?: string;
};

export type GoalContext = {
  id: string;
  title: string;
  category: string;
  status: 'active' | 'paused' | 'completed';
  progress: number;
};

export type CheckInContext = {
  date: string;
  moods: string[];
  happiness: number;
  stress: number;
  sleep: number;
  reflection?: string;
  win?: string;
};

export type JournalContext = { date: string; text: string };

/** `move` is the coaching move behind a coach message (absent on older messages). */
export type HistoryMessage = { role: 'user' | 'coach'; text: string; move?: string };

export type CoachContextData = {
  /** YYYY-MM-DD in the user's day (server uses UTC); check-ins older than 14 days are dropped. */
  today: string;
  profile: ProfileContext;
  goals: GoalContext[];
  checkIns: CheckInContext[];
  journal: JournalContext[];
  /** Oldest first, excluding the current user message. */
  history: HistoryMessage[];
  /** Total messages in the thread before this turn (history may be a recent window of it). */
  historyTotal: number;
  summary?: string;
  summaryMessageCount: number;
  previousSessionSummary?: string;
  /** What the coach carries between conversations (server-owned, private/coach). */
  memory?: CoachMemory;
  mode: ConversationMode;
  reflectionCheckInId?: string;
};

export type Emotion = string;

export type CoachingStage =
  | 'opening'
  | 'exploring'
  | 'awareness'
  | 'wants'
  | 'options'
  | 'commitment'
  | 'accountability'
  | 'closing';

export type UserIntent =
  | 'share'
  | 'vent'
  | 'ask_advice'
  | 'ask_info'
  | 'report_progress'
  | 'decide'
  | 'small_talk'
  | 'push_back'
  | 'closing'
  | 'other';

export type TurnAnalysis = {
  emotions: Emotion[];
  emotionalIntensity: 0 | 1 | 2 | 3;
  topic: string;
  stage: CoachingStage;
  intent: UserIntent;
  explicitAdviceRequest: boolean;
  insightMoment: boolean;
  commitmentStated: boolean;
  resistance: boolean;
  contradiction: string | null;
  assumptions: string[];
  values: string[];
  /** The user's own words worth reflecting back. */
  keyPhrase: string;
  risk: 'none' | 'elevated' | 'crisis';
  relevantGoalIds: string[];
  useCheckIns: boolean;
  useJournal: boolean;
  referencesPastSession: boolean;
  goalProgressReported: { goalId: string; progress: number } | null;
  /** A harsh self-judging voice, near-quoted ("I'm not smart enough"). */
  innerCritic: string | null;
  /** Long narrative heavy on detail, light on what it means to them. */
  storytelling: boolean;
  /** A theme that keeps coming back across this conversation or earlier ones. */
  pattern: string | null;
  /** Stuck in one way of seeing it, or a forced either/or. */
  singlePerspective: boolean;
  /** Wants options or ideas to consider, not a verdict. */
  wantsIdeas: boolean;
  /** Reporting back on a commitment: how it went. */
  progressOutcome: 'kept' | 'partial' | 'missed' | null;
  /** The concrete commitment they just made, if any. */
  commitment: { action: string; when: string | null } | null;
  /** Settling for less than they said they want; room for a stretching request. */
  playingSmall: boolean;
  /** Which open commitment (by id) this message reports on. */
  resolvedCommitmentId: string | null;
  /** How they said they want to be coached ("be blunt with me"). */
  allianceNote: string | null;
  /** Energy behind the words, heard beyond the content. */
  energy: 'low' | 'steady' | 'rising';
  /** Something that seems present but unsaid; a hunch, not a fact. */
  unspoken: string | null;
};

export type CommitmentStatus = 'open' | 'kept' | 'partial' | 'missed';

export type Commitment = {
  id: string;
  text: string;
  when: string | null;
  /** Epoch ms. */
  createdAt: number;
  status: CommitmentStatus;
  conversationId: string;
};

/** What the coach holds between conversations: the alliance, their bigger agenda, values and commitments. */
export type CoachMemory = {
  alliance: string[];
  /** Epoch ms of the last time the coach asked how they want to be coached. */
  allianceAskedAt: number | null;
  bigAgenda: string | null;
  values: { name: string; count: number }[];
  commitments: Commitment[];
};

/** What one turn adds to the memory; applied by the server after the turn completes. */
export type MemoryDelta = {
  alliance?: string;
  allianceAsked?: boolean;
  values?: string[];
  commitment?: { action: string; when: string | null };
  resolve?: { id: string; outcome: Exclude<CommitmentStatus, 'open'> };
  bigAgenda?: string;
};

export const MOVES = [
  'safety',
  'open_session',
  'design_alliance',
  'clearing',
  'acknowledge_and_explore',
  'reflect_and_deepen',
  'powerful_question',
  'bottom_line',
  'offer_intuition',
  'clarify_want',
  'explore_values',
  'explore_perspectives',
  'challenge_assumption',
  'name_contradiction',
  'name_inner_critic',
  'explore_resistance',
  'deepen_insight',
  'brainstorm',
  'move_to_action',
  'secure_commitment',
  'make_request',
  'accountability_check',
  'acknowledge',
  'close_with_inquiry',
  'advice_with_permission',
] as const;
export type Move = (typeof MOVES)[number];

export type MovePlan = {
  primary: Move;
  secondary?: Move;
  /** Max questions the reply may ask. */
  maxQuestions: number;
  targetWords: number;
  why: string;
};

export type GuardIssue = {
  check: string;
  severity: 'block' | 'warn';
  detail: string;
};

export type EngineInput = {
  text: string;
  channel: Channel;
  context: CoachContextData;
};

export type EngineTrace = {
  analysis: TurnAnalysis;
  analysisSource: 'model' | 'fallback';
  /** Why the model's reading wasn't used, when it was asked for. */
  analysisError?: string;
  plan: MovePlan;
  guardIssues: GuardIssue[];
  regenerated: boolean;
  models: { analysis?: string; reply: string };
  latencyMs: { analysis: number; reply: number; total: number };
  tokens: { input: number; output: number };
};

export type EngineResult = {
  reply: string;
  memory?: MemoryDelta;
  proposal?: GoalProgressProposal;
  summary?: { text: string; messageCount: number };
  trace: EngineTrace;
};
