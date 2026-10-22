import { LIMITS } from '../config.js';

/** The daily allowance runs per UTC calendar day, e.g. "2026-10-22". */
export function dayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function nextDayStart(nowMs: number): number {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
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
