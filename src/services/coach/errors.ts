import type { CoachErrorReason } from './types';

const KNOWN_REASONS: readonly CoachErrorReason[] = [
  'unauthenticated',
  'invalid-input',
  'turn-id-reused',
  'no-credits',
  'rate-limited',
  'turn-in-progress',
  'ai-unavailable',
  'no-speech',
  'not-configured',
  'app-check',
  'internal',
];

/** Older draft names, accepted so a mismatched deploy still maps to the current reason. */
const LEGACY_REASONS: Record<string, CoachErrorReason> = {
  'in-progress': 'turn-in-progress',
  'provider-unavailable': 'ai-unavailable',
  'invalid-request': 'invalid-input',
  'text-too-long': 'invalid-input',
  'audio-too-long': 'invalid-input',
  'conversation-not-found': 'invalid-input',
  'check-in-not-found': 'invalid-input',
};

const MESSAGES: Record<CoachErrorReason, string> = {
  unauthenticated: 'Please log in again to talk with your coach.',
  'invalid-input': 'That message couldn’t be sent. Please try again.',
  'turn-id-reused': 'That message couldn’t be sent again. Delete it and send a new one.',
  'no-credits': "You've run out of credits for this month.",
  'rate-limited': 'You’re sending messages quickly. Give it a moment and try again.',
  'turn-in-progress': 'Still working on your last message…',
  'ai-unavailable': "I'm having trouble connecting right now. Please try again.",
  'no-speech': "I couldn't catch that. Tap the orb and try again.",
  'not-configured': 'Your coach isn’t switched on yet. Please try again later.',
  'app-check': 'This device couldn’t be verified. Please try again later.',
  internal: "I'm having trouble connecting right now. Please try again.",
  'not-deployed': 'Your coach isn’t switched on yet. Please try again later.',
  network: 'No connection. Check your internet and try again.',
  unknown: "I'm having trouble connecting right now. Please try again.",
};

/** Reasons where sending the same clientTurnId again can succeed. */
const RETRYABLE = new Set<CoachErrorReason>([
  'rate-limited',
  'turn-in-progress',
  'ai-unavailable',
  'internal',
  'network',
  'unknown',
  'not-deployed',
]);

export class CoachError extends Error {
  readonly reason: CoachErrorReason;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(reason: CoachErrorReason, options?: { retryAfterMs?: number; retryable?: boolean }) {
    super(MESSAGES[reason]);
    this.name = 'CoachError';
    this.reason = reason;
    this.retryAfterMs = options?.retryAfterMs;
    this.retryable = options?.retryable ?? RETRYABLE.has(reason);
  }
}

type FunctionsErrorLike = { code?: unknown; details?: unknown; message?: unknown };

function asReason(value: string): CoachErrorReason | null {
  if ((KNOWN_REASONS as readonly string[]).includes(value)) return value as CoachErrorReason;
  return LEGACY_REASONS[value] ?? null;
}

/** Maps a Firebase callable error (or anything thrown) to a user-safe CoachError. */
export function toCoachError(error: unknown): CoachError {
  if (error instanceof CoachError) return error;
  const e = (typeof error === 'object' && error !== null ? error : {}) as FunctionsErrorLike;
  const code = typeof e.code === 'string' ? e.code.replace(/^functions\//, '') : '';
  const details = (typeof e.details === 'object' && e.details !== null ? e.details : {}) as Record<string, unknown>;
  const reason = typeof details.reason === 'string' ? asReason(details.reason) : null;
  const retryAfterMs = typeof details.retryAfterMs === 'number' ? details.retryAfterMs : undefined;
  const retryable = typeof details.retryable === 'boolean' ? details.retryable : undefined;

  if (reason) return new CoachError(reason, { retryAfterMs, retryable });

  switch (code) {
    case 'unauthenticated':
      return new CoachError('unauthenticated');
    case 'not-found':
      // A not-found without a reason means the function itself doesn't exist yet.
      return new CoachError('not-deployed');
    case 'resource-exhausted':
      return new CoachError('rate-limited', { retryAfterMs });
    case 'aborted':
      return new CoachError('turn-in-progress', { retryAfterMs });
    case 'invalid-argument':
      return new CoachError('invalid-input');
    case 'failed-precondition':
      return new CoachError('not-configured');
    case 'permission-denied':
      return new CoachError('app-check');
    case 'unavailable':
    case 'deadline-exceeded':
      return new CoachError('network');
    case 'internal':
      return new CoachError('internal');
    default:
      return new CoachError('unknown');
  }
}
