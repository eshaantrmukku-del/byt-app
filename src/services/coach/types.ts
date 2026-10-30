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

/** How long the coach thinks before replying (Settings → Coach thinking). */
export type CoachThinking = 'standard' | 'deeper' | 'deepest';
export const COACH_THINKING: readonly CoachThinking[] = ['standard', 'deeper', 'deepest'];

/** The coach's speaking voice (Settings → Coach voice). See src/features/voice/voices.ts. */
export type CoachVoice = 'ivy' | 'nova' | 'wren' | 'leo' | 'kai' | 'sam';
export const COACH_VOICES: readonly CoachVoice[] = ['ivy', 'nova', 'wren', 'leo', 'kai', 'sam'];

type TurnTarget = {
  requestId: string;
  conversationId: string;
  mode: ConversationMode;
  reflectionCheckInId?: IsoDate;
  thinking?: CoachThinking;
};

export type CoachTurnRequest = TurnTarget &
  ({ kind: 'message'; text: string } | { kind: 'opener'; text?: undefined });

export type VoiceTurnRequest = TurnTarget & {
  audio: { base64: string; mimeType: VoiceAudioMimeType; durationMs: number };
  wantAudio?: boolean;
  voice?: CoachVoice;
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
  usage: UsageSnapshot;
  proposal?: GoalProgressProposal;
};

/**
 * Today's AI allowance in tokens (UTC day). `metered` is false for turns that
 * never count: openers and replays of a finished turn.
 */
export type UsageSnapshot = { used: number; limit: number; resetsAt: number; metered: boolean };

export type ReplyAudio = { base64: string; mimeType: 'audio/wav' };

export type VoiceTurnResponse = CoachTurnResponse & {
  transcript: string;
  /** First part of the spoken reply; fetch parts 1..audioParts-1 with voiceAudio while it plays. */
  replyAudio: ReplyAudio | null;
  audioParts: number;
};

export type AccountSnapshot = {
  plan: Plan;
  usage: Omit<UsageSnapshot, 'metered'>;
  /** True once prototype data on users/{uid} has been copied into the v2 collections. */
  legacyImported: boolean;
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
