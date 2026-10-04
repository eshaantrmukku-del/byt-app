/**
 * Public contract of the BYT coach callables. The app keeps an identical copy in
 * src/services/coach/; change both together (see internal/coach-api-contract.md).
 */

export const FUNCTIONS_REGION = 'europe-west2';

export type ConversationMode = 'normal' | 'reflection';
export type Channel = 'text' | 'voice';
export type Plan = 'standard' | 'plus';

export type CoachTurnRequest = {
  conversationId: string;
  clientTurnId: string;
  text: string;
  mode?: ConversationMode;
  reflectionCheckInId?: string;
};

export type GoalProgressProposal = { goalId: string; progress: number; reason: string };

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

export const VOICE_MIME_TYPES = [
  'audio/m4a',
  'audio/mp4',
  'audio/aac',
  'audio/mpeg',
  'audio/wav',
  'audio/webm',
  'audio/ogg',
] as const;
export type VoiceMimeType = (typeof VOICE_MIME_TYPES)[number];

export type VoiceTurnRequest = {
  conversationId: string;
  clientTurnId: string;
  audioBase64: string;
  mimeType: VoiceMimeType;
  mode?: ConversationMode;
  reflectionCheckInId?: string;
  wantAudio?: boolean;
};

export type VoiceTurnResponse = CoachTurnResponse & {
  transcript: string;
  audioBase64: string | null;
  audioMimeType: 'audio/mpeg' | null;
};

export type AccountResponse = {
  plan: Plan;
  creditsRemaining: number;
  monthlyAllowance: number;
  creditsPeriodKey: string;
  resetsAt: number;
};

export type DeleteAccountRequest = { confirm: 'DELETE' };

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
  | 'internal';

export type CoachErrorDetails = {
  reason: CoachErrorReason;
  retryable: boolean;
  retryAfterMs?: number;
  creditsRemaining?: number;
};

export const userMessageId = (clientTurnId: string) => `${clientTurnId}-u`;
export const coachMessageId = (clientTurnId: string) => `${clientTurnId}-c`;
