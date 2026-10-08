import { HttpsError, type FunctionsErrorCode } from 'firebase-functions/v2/https';

import type { CoachErrorDetails, CoachErrorReason } from './contract.js';

const CODES: Record<CoachErrorReason, FunctionsErrorCode> = {
  unauthenticated: 'unauthenticated',
  'invalid-request': 'invalid-argument',
  'text-too-long': 'invalid-argument',
  'audio-too-long': 'invalid-argument',
  'no-credits': 'resource-exhausted',
  'rate-limited': 'resource-exhausted',
  'in-progress': 'aborted',
  'provider-unavailable': 'unavailable',
  'no-speech': 'invalid-argument',
  'conversation-not-found': 'not-found',
  'check-in-not-found': 'not-found',
  'not-configured': 'failed-precondition',
  internal: 'internal',
};

const MESSAGES: Record<CoachErrorReason, string> = {
  unauthenticated: 'Please log in again to talk with your coach.',
  'invalid-request': 'That message couldn’t be sent. Please try again.',
  'text-too-long': 'That message is too long. Try splitting it up.',
  'audio-too-long': 'Keep voice turns under a minute.',
  'no-credits': "You've run out of credits for this month.",
  'rate-limited': 'You’re sending messages quickly. Give it a moment and try again.',
  'in-progress': 'Still working on your last message…',
  'provider-unavailable': "I'm having trouble connecting right now. Please try again.",
  'no-speech': "I couldn't catch that. Tap the orb and try again.",
  'conversation-not-found': 'This conversation is no longer available. Start a new one.',
  'check-in-not-found': 'That check-in is no longer available.',
  'not-configured': 'Your coach isn’t switched on yet. Please try again later.',
  internal: "I'm having trouble connecting right now. Please try again.",
};

const RETRYABLE: ReadonlySet<CoachErrorReason> = new Set([
  'rate-limited',
  'in-progress',
  'provider-unavailable',
  'not-configured',
  'internal',
]);

export type CoachErrorExtra = {
  retryAfterSeconds?: number;
  remaining?: number;
  resetsAt?: string;
  refunded?: boolean;
};

export class CoachError extends Error {
  constructor(
    readonly reason: CoachErrorReason,
    readonly extra: CoachErrorExtra = {},
  ) {
    super(reason);
  }
}

export function toHttpsError(error: unknown): HttpsError {
  if (error instanceof HttpsError) return error;
  const reason: CoachErrorReason = error instanceof CoachError ? error.reason : 'internal';
  const extra = error instanceof CoachError ? error.extra : {};
  const details: CoachErrorDetails = { reason, retryable: RETRYABLE.has(reason), ...extra };
  return new HttpsError(CODES[reason], MESSAGES[reason], details);
}
