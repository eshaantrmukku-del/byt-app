import { HttpsError, type FunctionsErrorCode } from 'firebase-functions/v2/https';

import type { CoachErrorDetails, CoachErrorReason } from './contract.js';

const CODES: Record<CoachErrorReason, FunctionsErrorCode> = {
  unauthenticated: 'unauthenticated',
  'invalid-input': 'invalid-argument',
  'turn-id-reused': 'invalid-argument',
  'no-credits': 'resource-exhausted',
  'rate-limited': 'resource-exhausted',
  'turn-in-progress': 'aborted',
  'ai-unavailable': 'unavailable',
  'no-speech': 'invalid-argument',
  'not-configured': 'failed-precondition',
  'app-check': 'permission-denied',
  internal: 'internal',
};

const MESSAGES: Record<CoachErrorReason, string> = {
  unauthenticated: 'Please sign in again.',
  'invalid-input': "That message couldn't be sent.",
  'turn-id-reused': "That message couldn't be sent. Please try again.",
  'no-credits': "You've used all your coaching messages for this month.",
  'rate-limited': "You're sending messages quickly. Take a breath and try again in a moment.",
  'turn-in-progress': 'Your coach is still replying to that message.',
  'ai-unavailable': "Your coach couldn't reply just now. You haven't been charged — please try again.",
  'no-speech': "I couldn't hear anything in that recording. You haven't been charged.",
  'not-configured': 'The coach is not available yet.',
  'app-check': 'This app version could not be verified.',
  internal: "Something went wrong. You haven't been charged — please try again.",
};

const RETRYABLE: ReadonlySet<CoachErrorReason> = new Set([
  'rate-limited',
  'turn-in-progress',
  'ai-unavailable',
  'internal',
]);

export class CoachError extends Error {
  constructor(
    readonly reason: CoachErrorReason,
    readonly extra: Omit<CoachErrorDetails, 'reason' | 'retryable'> = {},
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
