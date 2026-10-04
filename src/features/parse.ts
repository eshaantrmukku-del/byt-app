import {
  GOAL_CATEGORIES,
  GOAL_STATUSES,
  type Account,
  type ChatMessage,
  type CheckIn,
  type Conversation,
  type Goal,
  type GoalCategory,
  type GoalStatus,
  type JournalEntry,
} from '@/types/models';

import { isMetricValue, isMoodId } from './checkIns/checkIns';
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
  const moods = Array.isArray(d.moods) ? d.moods.filter(isMoodId) : [];
  if (!isIsoDate(id) || moods.length === 0 || !isMetricValue(d.happiness) || !isMetricValue(d.stress) || !isMetricValue(d.sleep)) {
    return null;
  }
  return {
    id,
    date: id,
    moods,
    happiness: d.happiness,
    stress: d.stress,
    sleep: d.sleep,
    ...(typeof d.reflection === 'string' && d.reflection ? { reflection: d.reflection } : {}),
    ...(typeof d.win === 'string' && d.win ? { win: d.win } : {}),
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

export function parseConversation(id: string, d: Data): Conversation {
  const mode = d.mode === 'reflection' ? 'reflection' : 'normal';
  const createdAt = toMillis(d.createdAt);
  return {
    id,
    title: str(d.title) || (mode === 'reflection' ? 'Reflection discussion' : 'Coaching session'),
    mode,
    ...(isIsoDate(d.reflectionCheckInId) ? { reflectionCheckInId: d.reflectionCheckInId } : {}),
    titleEdited: d.titleEdited === true,
    lastMessagePreview: str(d.lastMessagePreview),
    createdAt,
    updatedAt: Math.max(toMillis(d.updatedAt, createdAt), toMillis(d.lastMessageAt, 0)),
  };
}

export function parseMessage(id: string, d: Data): ChatMessage | null {
  const text = str(d.text);
  if (!text || (d.role !== 'user' && d.role !== 'coach')) return null;
  return {
    id,
    role: d.role,
    text,
    clientTurnId: str(d.clientTurnId) || id,
    channel: d.channel === 'voice' ? 'voice' : 'text',
    createdAt: toMillis(d.createdAt),
  };
}

export function parseAccount(d: Data | undefined): Account | null {
  if (!d || typeof d.creditsRemaining !== 'number') return null;
  return {
    plan: d.plan === 'plus' ? 'plus' : 'standard',
    creditsRemaining: Math.max(0, Math.floor(d.creditsRemaining)),
    creditsPeriodKey: str(d.creditsPeriodKey),
  };
}
