/**
 * Public contract of the BYT coach callables.
 * Reconciled with the frontend client on byt-v1 (src/services/coach/types.ts).
 * See internal/coach-api-contract.md.
 */

export const FUNCTIONS_REGION = 'europe-west2';

export type ConversationMode = 'normal' | 'reflection';
export type Channel = 'text' | 'voice';
export type Plan = 'standard' | 'plus';
export type TurnKind = 'message' | 'opener';
/** How long the coach thinks before replying: standard (fastest) → deepest. */
export type CoachThinking = 'standard' | 'deeper' | 'deepest';
export const COACH_THINKING: readonly CoachThinking[] = ['standard', 'deeper', 'deepest'];
/** The coach's speaking voice (Settings → Coach voice). Each maps to a voice of the speech provider. */
export type CoachVoice = 'ivy' | 'nova' | 'wren' | 'leo' | 'kai' | 'sam';
export const COACH_VOICES: readonly CoachVoice[] = ['ivy', 'nova', 'wren', 'leo', 'kai', 'sam'];

export type CoachTurnRequest = {
  /** /^[A-Za-z0-9_-]{8,64}$/ — unique per user turn, reused on retry. */
  requestId: string;
  conversationId: string;
  kind: TurnKind;
  /** Required when kind is 'message'. */
  text?: string;
  mode: ConversationMode;
  reflectionCheckInId?: string;
  /** Defaults to 'standard'. */
  thinking?: CoachThinking;
};

export type GoalProgressProposal = { goalId: string; progress: number; reason: string };

export type CoachMessagePayload = { id: string; text: string; createdAt: number };

export type CoachTurnResponse = {
  requestId: string;
  conversationId: string;
  replayed: boolean;
  /** Null for session openers (the coach speaks first). */
  userMessage: CoachMessagePayload | null;
  reply: CoachMessagePayload;
  usage: UsageSnapshot;
  /** Present only when the user reported concrete goal progress. The app asks before applying it. */
  proposal?: GoalProgressProposal;
};

/**
 * The day's AI allowance, in Gemini tokens. `metered` is false for turns that
 * never count (openers, replays of a finished turn).
 */
export type UsageSnapshot = { used: number; limit: number; resetsAt: number; metered: boolean };

export const VOICE_MIME_TYPES = ['audio/mp4', 'audio/m4a', 'audio/aac', 'audio/webm', 'audio/wav'] as const;
export type VoiceMimeType = (typeof VOICE_MIME_TYPES)[number];

export type VoiceTurnRequest = {
  requestId: string;
  conversationId: string;
  mode: ConversationMode;
  reflectionCheckInId?: string;
  audio: { base64: string; mimeType: VoiceMimeType; durationMs: number };
  wantAudio?: boolean;
  thinking?: CoachThinking;
  /** Defaults to 'ivy'. */
  voice?: CoachVoice;
};

export type ReplyAudio = { base64: string; mimeType: 'audio/wav' };

export type VoiceTurnResponse = CoachTurnResponse & {
  transcript: string;
  /**
   * The first part of the spoken reply, so playback starts while the rest is made.
   * Fetch parts 1..audioParts-1 with voiceAudio. Null when audio wasn't wanted or failed.
   */
  replyAudio: ReplyAudio | null;
  audioParts: number;
};

/** One later part of a finished voice turn's spoken reply. */
export type VoiceAudioRequest = { requestId: string; part: number; voice?: CoachVoice };

/** A short sample of a voice, for choosing one. Free; the same few seconds for everyone. */
export type VoicePreviewRequest = { voice: CoachVoice };
export type VoicePreviewResponse = { voice: CoachVoice; replyAudio: ReplyAudio | null };
export type VoiceAudioResponse = { requestId: string; part: number; replyAudio: ReplyAudio | null };

export type AccountResponse = {
  plan: Plan;
  usage: Omit<UsageSnapshot, 'metered'>;
  /** True once any prototype data on users/{uid} has been copied into the v2 collections. */
  legacyImported: boolean;
};

/** Reasons the app's toCoachError() understands. */
export type CoachErrorReason =
  | 'unauthenticated'
  | 'invalid-request'
  | 'text-too-long'
  | 'audio-too-long'
  | 'no-credits'
  | 'rate-limited'
  | 'in-progress'
  | 'provider-unavailable'
  | 'no-speech'
  | 'conversation-not-found'
  | 'check-in-not-found'
  | 'not-configured'
  | 'internal';

export type CoachErrorDetails = {
  reason: CoachErrorReason;
  retryable: boolean;
  retryAfterSeconds?: number;
  /** Daily-limit errors: when the allowance resets (epoch ms). */
  resetsAt?: number;
  refunded?: boolean;
};

/** User turn document id is the request id; the coach reply is `{requestId}_reply`. */
export const userMessageId = (requestId: string) => requestId;
export const coachMessageId = (requestId: string) => `${requestId}_reply`;
