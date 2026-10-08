/**
 * BYT Firestore data model (schema v2, per-entity subcollections).
 *
 *   users/{uid}                                     UserProfileDoc        client-writable, rules-validated
 *   users/{uid}/goals/{goalId}                      GoalDoc               client-writable
 *   users/{uid}/checkIns/{YYYY-MM-DD}               CheckInDoc            client-writable, one per day
 *   users/{uid}/journal/{entryId}                   JournalEntryDoc       client-writable
 *   users/{uid}/conversations/{cid}                 ConversationDoc       client creates; afterwards client may only rename
 *   users/{uid}/conversations/{cid}/messages/{mid}  MessageDoc            backend-only (see internal/coach-api-contract.md)
 *   users/{uid}/private/account                     AccountDoc            server-only (plan + credits)
 *   users/{uid}/turns/{clientTurnId}                TurnDoc               server-only (credit idempotency)
 *
 * Legacy prototype docs (schema v1) kept everything as arrays on users/{uid}.
 * Those fields are left untouched; only the profile is carried over.
 */
import type { FieldValue, Timestamp } from 'firebase/firestore';

export const PROFILE_SCHEMA_VERSION = 2;

/** Timestamps are `Timestamp` when read and `FieldValue` (serverTimestamp) when written. */
export type ServerTime = Timestamp | FieldValue;

export type IsoDate = string; // YYYY-MM-DD

export type ProfileFields = {
  displayName: string;
  dateOfBirth: IsoDate | null;
  profession: string;
  goalsSummary: string;
  income: string;
  lifestyle: string;
  struggles: string;
  coachNotes: string;
};

export type UserProfileDoc = ProfileFields & {
  schemaVersion: typeof PROFILE_SCHEMA_VERSION;
  email: string;
  onboardingCompleted: boolean;
  createdAt: ServerTime;
  updatedAt: ServerTime;
};

/** Profile as held in app state (timestamps normalised away). */
export type UserProfile = ProfileFields & {
  email: string;
  onboardingCompleted: boolean;
};

export const GOAL_STATUSES = ['active', 'paused', 'completed'] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const GOAL_CATEGORIES = [
  'career',
  'health',
  'fitness',
  'personal',
  'finance',
  'learning',
  'social',
  'creativity',
  'other',
] as const;
export type GoalCategory = (typeof GOAL_CATEGORIES)[number];

export type GoalDoc = {
  title: string;
  category: GoalCategory;
  status: GoalStatus;
  /** 0–100, set by the user (or a coach proposal the user confirms). */
  progress: number;
  createdAt: ServerTime;
  updatedAt: ServerTime;
};

export const MOOD_IDS = [
  'energized',
  'balanced',
  'calm',
  'anxious',
  'tired',
  'productive',
  'focused',
  'overwhelmed',
] as const;
export type MoodId = (typeof MOOD_IDS)[number];

/** Sliders are 1–10. Document id is the local calendar date, so there is one check-in per day. */
export type CheckInDoc = {
  date: IsoDate;
  /** At least one; first is the primary mood. */
  moods: MoodId[];
  happiness: number;
  stress: number;
  sleep: number;
  reflection?: string;
  win?: string;
  createdAt: ServerTime;
  updatedAt: ServerTime;
};

export type JournalEntryDoc = {
  date: IsoDate;
  text: string;
  createdAt: ServerTime;
  updatedAt: ServerTime;
};

export type ConversationMode = 'normal' | 'reflection';

export type ConversationDoc = {
  title: string;
  mode: ConversationMode;
  reflectionCheckInId?: IsoDate;
  /** True once the user renames it; stops automatic titles from the first message. */
  titleEdited: boolean;
  /** Written by the backend only. */
  summary?: string;
  lastMessagePreview?: string;
  lastMessageAt?: ServerTime;
  createdAt: ServerTime;
  updatedAt: ServerTime;
};

export type MessageRole = 'user' | 'coach';
export type MessageChannel = 'text' | 'voice';

/** Written by the backend only: `{clientTurnId}-u` for the user turn, `{clientTurnId}-c` for the coach. */
export type MessageDoc = {
  role: MessageRole;
  text: string;
  /** Client-generated turn id shared with the backend (idempotent credit charging). */
  clientTurnId: string;
  channel: MessageChannel;
  createdAt: ServerTime;
};

export type Plan = 'standard' | 'plus';

/** Server-owned. Clients may read but never write. */
export type AccountDoc = {
  plan: Plan;
  betaTier: boolean;
  creditsRemaining: number;
  /** YYYY-MM; credits reset lazily when the period changes. */
  creditsPeriodKey: string;
  /** Credits granted at the start of the period. 150 until the server says otherwise. */
  monthlyAllowance?: number;
};

export type TurnStatus = 'pending' | 'completed' | 'failed';

/** Server-owned idempotency record for one user turn. */
export type TurnDoc = {
  status: TurnStatus;
  creditCharged: boolean;
  createdAt: ServerTime;
};

export const MONTHLY_CREDIT_ALLOWANCE = 150;

// ---------- App-state shapes (timestamps as epoch ms) ----------

type Timestamps = { createdAt: number; updatedAt: number };

export type Goal = Omit<GoalDoc, 'createdAt' | 'updatedAt'> & Timestamps & { id: string };

/** `id` is the check-in's date (YYYY-MM-DD). */
export type CheckIn = Omit<CheckInDoc, 'createdAt' | 'updatedAt'> & Timestamps & { id: IsoDate };

export type JournalEntry = { id: string; date: IsoDate; text: string } & Timestamps;

export type Account = Pick<AccountDoc, 'plan' | 'creditsRemaining' | 'creditsPeriodKey' | 'monthlyAllowance'>;

export type Conversation = {
  id: string;
  title: string;
  mode: ConversationMode;
  reflectionCheckInId?: IsoDate;
  titleEdited: boolean;
  lastMessagePreview: string;
  createdAt: number;
  updatedAt: number;
};

export type ChatMessage = {
  id: string;
  role: MessageRole;
  text: string;
  clientTurnId: string;
  channel: MessageChannel;
  createdAt: number;
};
