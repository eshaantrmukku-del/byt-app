import { MOOD_IDS, type IsoDate, type MoodId } from '@/types/models';

import { addDays } from '../dates';

export type MoodOption = { id: MoodId; label: string; icon: string };

export const MOODS: readonly MoodOption[] = [
  { id: 'energized', label: 'Energized', icon: '⚡' },
  { id: 'balanced', label: 'Balanced', icon: '⚖️' },
  { id: 'calm', label: 'Calm', icon: '🍵' },
  { id: 'anxious', label: 'Anxious', icon: '☁️' },
  { id: 'tired', label: 'Tired', icon: '😴' },
  { id: 'productive', label: 'Productive', icon: '🚀' },
  { id: 'focused', label: 'Focused', icon: '🎯' },
  { id: 'overwhelmed', label: 'Overwhelmed', icon: '🌊' },
];

export type MetricKey = 'happiness' | 'stress' | 'sleep';

export type Metric = { key: MetricKey; label: string; low: string; high: string; defaultValue: number };

/** 1–10 sliders, in display order. */
export const METRICS: readonly Metric[] = [
  { key: 'happiness', label: 'Happiness', low: 'LOW', high: 'HIGH', defaultValue: 7 },
  { key: 'stress', label: 'Stress', low: 'CALM', high: 'STRESSED', defaultValue: 3 },
  { key: 'sleep', label: 'Sleep Quality', low: 'POOR', high: 'EXCELLENT', defaultValue: 8 },
];

/** Must match firestore.rules. */
export const REFLECTION_LIMIT = 2000;
export const WIN_LIMIT = 500;

export function isMetricValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 10;
}

export function isMoodId(value: unknown): value is MoodId {
  return typeof value === 'string' && (MOOD_IDS as readonly string[]).includes(value);
}

/** Toggles a mood; the last selected mood can't be removed. */
export function toggleMood(selected: readonly MoodId[], id: MoodId): MoodId[] {
  if (selected.includes(id)) return selected.length <= 1 ? [...selected] : selected.filter((m) => m !== id);
  return [...selected, id];
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
