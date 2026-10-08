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

export type HistoryMessage = { role: 'user' | 'coach'; text: string };

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
};

export const MOVES = [
  'safety',
  'open_session',
  'acknowledge_and_explore',
  'reflect_and_deepen',
  'powerful_question',
  'clarify_want',
  'challenge_assumption',
  'name_contradiction',
  'explore_resistance',
  'deepen_insight',
  'move_to_action',
  'secure_commitment',
  'accountability_check',
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
  plan: MovePlan;
  guardIssues: GuardIssue[];
  regenerated: boolean;
  models: { analysis?: string; reply: string };
  latencyMs: { analysis: number; reply: number; total: number };
  tokens: { input: number; output: number };
};

export type EngineResult = {
  reply: string;
  proposal?: GoalProgressProposal;
  summary?: { text: string; messageCount: number };
  trace: EngineTrace;
};
