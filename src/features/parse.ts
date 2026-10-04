import {
  GOAL_CATEGORIES,
  GOAL_STATUSES,
  type Account,
  type CheckIn,
  type Goal,
  type GoalCategory,
  type GoalStatus,
  type JournalEntry,
} from '@/types/models';

import { isRating } from './checkIns/checkIns';
import { isIsoDate } from './profile/dob';

type Data = Record<string, unknown>;

/** Firestore Timestamp (or a pending serverTimestamp read as an estimate) → epoch ms. */
export function toMillis(value: unknown, fallback = Date.now()): number {
  if (value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  return fallback;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Documents that don't match the schema are skipped rather than crashing the list. */
export function parseGoal(id: string, d: Data): Goal | null {
  const title = str(d.title);
  if (!title) return null;
  const category = (GOAL_CATEGORIES as readonly string[]).includes(str(d.category)) ? (d.category as GoalCategory) : 'other';
  const status = (GOAL_STATUSES as readonly string[]).includes(str(d.status)) ? (d.status as GoalStatus) : 'active';
  const progress = typeof d.progress === 'number' ? Math.min(100, Math.max(0, Math.round(d.progress))) : 0;
  return { id, title, category, status, progress, createdAt: toMillis(d.createdAt), updatedAt: toMillis(d.updatedAt) };
}

export function parseCheckIn(id: string, d: Data): CheckIn | null {
  if (!isIsoDate(id) || !isRating(d.mood) || !isRating(d.energy) || !isRating(d.stress) || !isRating(d.sleep)) {
    return null;
  }
  return {
    id,
    date: id,
    mood: d.mood,
    energy: d.energy,
    stress: d.stress,
    sleep: d.sleep,
    ...(typeof d.note === 'string' && d.note ? { note: d.note } : {}),
    createdAt: toMillis(d.createdAt),
    updatedAt: toMillis(d.updatedAt),
  };
}

export function parseJournalEntry(id: string, d: Data): JournalEntry | null {
  const text = str(d.text);
  if (!text) return null;
  const createdAt = toMillis(d.createdAt);
  const date = isIsoDate(d.date) ? d.date : new Date(createdAt).toISOString().slice(0, 10);
  return { id, date, text, createdAt, updatedAt: toMillis(d.updatedAt, createdAt) };
}

export function parseAccount(d: Data | undefined): Account | null {
  if (!d || typeof d.creditsRemaining !== 'number') return null;
  return {
    plan: d.plan === 'plus' ? 'plus' : 'standard',
    creditsRemaining: Math.max(0, Math.floor(d.creditsRemaining)),
    creditsPeriodKey: str(d.creditsPeriodKey),
  };
}
