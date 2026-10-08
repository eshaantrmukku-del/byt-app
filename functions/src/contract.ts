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

export type CoachTurnRequest = {
  /** /^[A-Za-z0-9_-]{8,64}$/ — unique per user turn, reused on retry. */
  requestId: string;
  conversationId: string;
  kind: TurnKind;
  /** Required when kind is 'message'. */
  text?: string;
  mode: ConversationMode;
  reflectionCheckInId?: string;
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
  credits: { remaining: number; periodKey: string; charged: 0 | 1 };
  /** Present only when the user reported concrete goal progress. The app asks before applying it. */
  proposal?: GoalProgressProposal;
};

export const VOICE_MIME_TYPES = ['audio/mp4', 'audio/m4a', 'audio/aac', 'audio/webm', 'audio/wav'] as const;
export type VoiceMimeType = (typeof VOICE_MIME_TYPES)[number];

export type VoiceTurnRequest = {
  requestId: string;
  conversationId: string;
  mode: ConversationMode;
  reflectionCheckInId?: string;
  audio: { base64: string; mimeType: VoiceMimeType; durationMs: number };
  wantAudio?: boolean;
};

export type VoiceTurnResponse = CoachTurnResponse & {
  transcript: string;
  replyAudio: { base64: string; mimeType: 'audio/mpeg' } | null;
};

export type AccountResponse = {
  plan: Plan;
  creditsRemaining: number;
  monthlyAllowance: number;
  creditsPeriodKey: string;
  resetsAt: number;
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
  remaining?: number;
  resetsAt?: string;
  refunded?: boolean;
};

/** User turn document id is the request id; the coach reply is `{requestId}_reply`. */
export const userMessageId = (requestId: string) => requestId;
export const coachMessageId = (requestId: string) => `${requestId}_reply`;
