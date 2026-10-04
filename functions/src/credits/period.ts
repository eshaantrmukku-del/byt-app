import { LIMITS } from '../config.js';

/** Credit periods are UTC calendar months, e.g. "2026-10". */
export function periodKey(nowMs: number): string {
  const d = new Date(nowMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function nextPeriodStart(nowMs: number): number {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

export type RateCheck = { ok: true; recent: number[] } | { ok: false; retryAfterMs: number };

/**
 * Sliding-window limiter over the timestamps of recently charged turns.
 * Returns the pruned list including `nowMs` when the turn is allowed.
 */
export function checkRateLimit(
  recent: readonly number[],
  nowMs: number,
  limits: { perMinute: number; perHour: number } = LIMITS.rate,
): RateCheck {
  const hourAgo = nowMs - 3_600_000;
  const minuteAgo = nowMs - 60_000;
  const lastHour = recent.filter((t) => t > hourAgo && t <= nowMs).sort((a, b) => a - b);
  const lastMinute = lastHour.filter((t) => t > minuteAgo);
  if (lastMinute.length >= limits.perMinute) {
    return { ok: false, retryAfterMs: lastMinute[lastMinute.length - limits.perMinute]! + 60_000 - nowMs };
  }
  if (lastHour.length >= limits.perHour) {
    return { ok: false, retryAfterMs: lastHour[lastHour.length - limits.perHour]! + 3_600_000 - nowMs };
  }
  return { ok: true, recent: [...lastHour, nowMs] };
}
