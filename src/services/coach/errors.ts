import type { CoachErrorReason } from './types';

const KNOWN_REASONS: readonly CoachErrorReason[] = [
  'no-credits',
  'rate-limited',
  'in-progress',
  'provider-unavailable',
  'no-speech',
  'invalid-request',
  'text-too-long',
  'audio-too-long',
  'conversation-not-found',
  'check-in-not-found',
];

const MESSAGES: Record<CoachErrorReason, string> = {
  'no-credits': "You've run out of credits for this month.",
  'rate-limited': 'You’re sending messages quickly. Give it a moment and try again.',
  'in-progress': 'Still working on your last message…',
  'provider-unavailable': "I'm having trouble connecting right now. Please try again.",
  'no-speech': "I couldn't catch that. Tap the orb and try again.",
  'invalid-request': 'That message couldn’t be sent. Please try again.',
  'text-too-long': 'That message is too long. Try splitting it up.',
  'audio-too-long': 'Keep voice turns under a minute.',
  'conversation-not-found': 'This conversation is no longer available. Start a new one.',
  'check-in-not-found': 'That check-in is no longer available.',
  unauthenticated: 'Please log in again to talk with your coach.',
  'not-deployed': 'Your coach isn’t switched on yet. Please try again later.',
  network: 'No connection. Check your internet and try again.',
  unknown: "I'm having trouble connecting right now. Please try again.",
};

/** Reasons where sending the same request again can succeed. */
const RETRYABLE = new Set<CoachErrorReason>(['rate-limited', 'in-progress', 'provider-unavailable', 'network', 'unknown', 'not-deployed']);

export class CoachError extends Error {
  readonly reason: CoachErrorReason;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;

  constructor(reason: CoachErrorReason, retryAfterSeconds?: number) {
    super(MESSAGES[reason]);
    this.name = 'CoachError';
    this.reason = reason;
    this.retryable = RETRYABLE.has(reason);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

type FunctionsErrorLike = { code?: unknown; details?: unknown; message?: unknown };

/** Maps a Firebase callable error (or anything thrown) to a user-safe CoachError. */
export function toCoachError(error: unknown): CoachError {
  if (error instanceof CoachError) return error;
  const e = (typeof error === 'object' && error !== null ? error : {}) as FunctionsErrorLike;
  const code = typeof e.code === 'string' ? e.code.replace(/^functions\//, '') : '';
  const details = (typeof e.details === 'object' && e.details !== null ? e.details : {}) as Record<string, unknown>;
  const reason = typeof details.reason === 'string' ? details.reason : '';
  const retryAfter = typeof details.retryAfterSeconds === 'number' ? details.retryAfterSeconds : undefined;

  if ((KNOWN_REASONS as readonly string[]).includes(reason)) {
    return new CoachError(reason as CoachErrorReason, retryAfter);
  }
  switch (code) {
    case 'unauthenticated':
      return new CoachError('unauthenticated');
    case 'not-found':
      // A not-found without a reason means the function itself doesn't exist yet.
      return new CoachError('not-deployed');
    case 'resource-exhausted':
      return new CoachError('rate-limited', retryAfter);
    case 'aborted':
      return new CoachError('in-progress');
    case 'invalid-argument':
      return new CoachError('invalid-request');
    case 'unavailable':
    case 'deadline-exceeded':
      return new CoachError('network');
    default:
      return new CoachError('unknown');
  }
}
