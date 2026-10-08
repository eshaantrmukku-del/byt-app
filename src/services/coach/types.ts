/**
 * Callable contract for the BYT coaching backend.
 * Source of truth: internal/coach-api-contract.md (backend, v1). Keep in sync.
 */
import type { ConversationMode, IsoDate, Plan } from '@/types/models';

export const COACH_TEXT_LIMIT = 4000;
/** Recorded clip limit from the contract: 90 seconds, 6 MB decoded. */
export const VOICE_MAX_DURATION_MS = 90_000;
export const VOICE_MAX_BYTES = 6_000_000;

/** Firestore ids and client turn ids: 1–64 chars from this set. */
export const COACH_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export type VoiceAudioMimeType =
  | 'audio/m4a'
  | 'audio/mp4'
  | 'audio/aac'
  | 'audio/mpeg'
  | 'audio/wav'
  | 'audio/webm'
  | 'audio/ogg';

export type CoachTurnRequest = {
  conversationId: string;
  /** Reuse this exact id when retrying the same user turn. */
  clientTurnId: string;
  /** 1–4000 characters after trim. */
  text: string;
  mode?: ConversationMode;
  reflectionCheckInId?: IsoDate;
};

export type GoalProgressProposal = {
  goalId: string;
  progress: number;
  reason: string;
};

export type CoachTurnResponse = {
  ok: true;
  clientTurnId: string;
  conversationId: string;
  userMessageId: string;
  coachMessageId: string;
  reply: string;
  creditsRemaining: number;
  replayed: boolean;
  proposal?: GoalProgressProposal;
};

export type VoiceTurnRequest = {
  conversationId: string;
  clientTurnId: string;
  audioBase64: string;
  mimeType: VoiceAudioMimeType;
  mode?: ConversationMode;
  reflectionCheckInId?: IsoDate;
  /** Default true. False asks for a text reply only. */
  wantAudio?: boolean;
};

export type VoiceTurnResponse = CoachTurnResponse & {
  transcript: string;
  audioBase64: string | null;
  audioMimeType: 'audio/mpeg' | null;
};

export type AccountSnapshot = {
  plan: Plan;
  creditsRemaining: number;
  monthlyAllowance: number;
  creditsPeriodKey: string;
  resetsAt: number;
};

/** Reasons the backend puts on `HttpsError.details.reason`, plus client-only ones. */
export type CoachErrorReason =
  | 'unauthenticated'
  | 'invalid-input'
  | 'turn-id-reused'
  | 'no-credits'
  | 'rate-limited'
  | 'turn-in-progress'
  | 'ai-unavailable'
  | 'no-speech'
  | 'not-configured'
  | 'app-check'
  | 'internal'
  | 'not-deployed'
  | 'network'
  | 'unknown';
