/**
 * Callable contract for the BYT coaching backend.
 * Source of truth: internal/coach-api-contract.md (Project store). Keep in sync.
 */
import type { ConversationMode, IsoDate } from '@/types/models';

export const COACH_TEXT_LIMIT = 4000;
export const VOICE_MAX_DURATION_MS = 60_000;
export const VOICE_MAX_BASE64_LENGTH = 2_800_000;

type TurnTarget = {
  /** /^[A-Za-z0-9_-]{8,64}$/ — unique per user turn, reused when retrying it. */
  requestId: string;
  conversationId: string;
  mode: ConversationMode;
  reflectionCheckInId?: IsoDate;
};

export type CoachTurnRequest = TurnTarget &
  ({ kind: 'message'; text: string } | { kind: 'opener'; text?: undefined });

export type VoiceAudioMimeType = 'audio/mp4' | 'audio/m4a' | 'audio/aac' | 'audio/webm' | 'audio/wav';

export type VoiceTurnRequest = TurnTarget & {
  audio: { base64: string; mimeType: VoiceAudioMimeType; durationMs: number };
  wantAudio?: boolean;
};

export type CoachMessagePayload = { id: string; text: string; createdAt: number };

export type CoachTurnResponse = {
  requestId: string;
  conversationId: string;
  replayed: boolean;
  userMessage: CoachMessagePayload | null;
  reply: CoachMessagePayload;
  credits: { remaining: number; periodKey: string; charged: 0 | 1 };
};

export type VoiceTurnResponse = CoachTurnResponse & {
  transcript: string;
  replyAudio: { base64: string; mimeType: 'audio/mpeg' } | null;
};

export type CoachErrorReason =
  | 'no-credits'
  | 'rate-limited'
  | 'in-progress'
  | 'provider-unavailable'
  | 'no-speech'
  | 'invalid-request'
  | 'text-too-long'
  | 'audio-too-long'
  | 'conversation-not-found'
  | 'check-in-not-found'
  | 'unauthenticated'
  | 'not-deployed'
  | 'network'
  | 'unknown';
