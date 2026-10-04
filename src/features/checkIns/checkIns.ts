import type { IsoDate } from '@/types/models';

import { addDays } from '../dates';

export type RatingKey = 'mood' | 'energy' | 'stress' | 'sleep';

export type RatingScale = { key: RatingKey; label: string; question: string; low: string; high: string };

/** All ratings are 1–5. For stress, higher means more stressed. */
export const RATING_SCALES: readonly RatingScale[] = [
  { key: 'mood', label: 'Mood', question: 'How are you feeling?', low: 'Low', high: 'Great' },
  { key: 'energy', label: 'Energy', question: 'How’s your energy?', low: 'Drained', high: 'Energised' },
  { key: 'stress', label: 'Stress', question: 'How stressed are you?', low: 'Calm', high: 'Overwhelmed' },
  { key: 'sleep', label: 'Sleep', question: 'How did you sleep?', low: 'Poorly', high: 'Really well' },
];

export const CHECK_IN_NOTE_LIMIT = 1000;

export type Ratings = Record<RatingKey, number | null>;

export const EMPTY_RATINGS: Ratings = { mood: null, energy: null, stress: null, sleep: null };

export function isRating(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}

/** Keys still unanswered, in display order. */
export function missingRatings(ratings: Ratings): RatingKey[] {
  return RATING_SCALES.map((s) => s.key).filter((k) => !isRating(ratings[k]));
}

export type Streaks = { current: number; best: number; checkedInToday: boolean };

/**
 * A streak is consecutive calendar days with a check-in. Today's streak stays
 * alive until the day ends, so it counts back from yesterday if today is still open.
 */
export function computeStreaks(dates: Iterable<IsoDate>, today: IsoDate): Streaks {
  const days = new Set(dates);
  const checkedInToday = days.has(today);

  let current = 0;
  let cursor = checkedInToday ? today : addDays(today, -1);
  while (days.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  let best = 0;
  for (const day of days) {
    if (days.has(addDays(day, -1))) continue; // not the start of a run
    let length = 1;
    let next = addDays(day, 1);
    while (days.has(next)) {
      length += 1;
      next = addDays(next, 1);
    }
    best = Math.max(best, length);
  }
  return { current, best, checkedInToday };
}
