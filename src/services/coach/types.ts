/**
 * Callable contract for the BYT coaching backend.
 * Source of truth: internal/coach-api-contract.md (v1, byt-backend). Keep in sync.
 */
import type { ConversationMode, IsoDate, Plan } from '@/types/models';

export const COACH_TEXT_LIMIT = 4000;
/** Recorded clip limit: 60 seconds, base64 length ≤ 2_800_000. */
export const VOICE_MAX_DURATION_MS = 60_000;
export const VOICE_MAX_BASE64_LENGTH = 2_800_000;

/** requestId: 8–64 chars. Reuse the same id when retrying a turn. */
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export type VoiceAudioMimeType = 'audio/mp4' | 'audio/m4a' | 'audio/aac' | 'audio/webm' | 'audio/wav';

type TurnTarget = {
  requestId: string;
  conversationId: string;
  mode: ConversationMode;
  reflectionCheckInId?: IsoDate;
};

export type CoachTurnRequest = TurnTarget &
  ({ kind: 'message'; text: string } | { kind: 'opener'; text?: undefined });

export type VoiceTurnRequest = TurnTarget & {
  audio: { base64: string; mimeType: VoiceAudioMimeType; durationMs: number };
  wantAudio?: boolean;
};

export type CoachMessagePayload = { id: string; text: string; createdAt: number };

export type GoalProgressProposal = { goalId: string; progress: number; reason: string };

export type CoachTurnResponse = {
  requestId: string;
  conversationId: string;
  replayed: boolean;
  /** Null when kind is `opener` (the coach spoke first; nothing was charged). */
  userMessage: CoachMessagePayload | null;
  /** User message id is `requestId`; coach message id is `{requestId}_reply`. */
  reply: CoachMessagePayload;
  credits: { remaining: number; periodKey: string; charged: 0 | 1 };
  proposal?: GoalProgressProposal;
};

export type VoiceTurnResponse = CoachTurnResponse & {
  transcript: string;
  replyAudio: { base64: string; mimeType: 'audio/mpeg' } | null;
};

export type AccountSnapshot = {
  plan: Plan;
  creditsRemaining: number;
  monthlyAllowance: number;
  creditsPeriodKey: string;
  resetsAt: number;
};

/** `details.reason` values from the contract, plus client-only transport failures. */
export type CoachErrorReason =
  | 'unauthenticated'
  | 'invalid-request'
  | 'text-too-long'
  | 'audio-too-long'
  | 'no-speech'
  | 'conversation-not-found'
  | 'check-in-not-found'
  | 'no-credits'
  | 'rate-limited'
  | 'in-progress'
  | 'provider-unavailable'
  | 'not-configured'
  | 'internal'
  | 'not-deployed'
  | 'network'
  | 'unknown';
