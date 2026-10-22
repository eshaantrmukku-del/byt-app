import type { Account, ChatMessage, CheckIn, Conversation, Goal, GoalCategory, GoalStatus, JournalEntry, MessageRole, MoodId } from '@/types/models';
import { GOAL_CATEGORIES, MOOD_IDS } from '@/types/models';

import { isIsoDate } from './dob';

type Data = Record<string, unknown>;

const str = (v: unknown) => (typeof v === 'string' ? v : '');

function asRecord(value: unknown): Data | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Data) : null;
}

function list(value: unknown): Data[] {
  if (!Array.isArray(value)) return [];
  return value.map(asRecord).filter((item): item is Data => item !== null);
}

const CALLABLE_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Must match legacyDocId in functions/src/legacy/importLegacy.ts: the backend
 * copies these rows into subcollections under the same ids.
 */
export function legacyDocId(raw: string): string {
  const id = raw.trim();
  if (CALLABLE_ID.test(id)) return id;
  return `legacy_${id.replace(/[^A-Za-z0-9_-]/g, '_')}`.slice(0, 64);
}

function clampMetric(value: unknown, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(10, Math.max(1, n));
}

function dateKey(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  if (isIsoDate(value)) return value;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  const date = new Date(parsed);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function categoryOf(value: unknown): GoalCategory {
  const name = str(value).trim().toLowerCase();
  return (GOAL_CATEGORIES as readonly string[]).includes(name) ? (name as GoalCategory) : 'other';
}

function statusOf(value: unknown): GoalStatus {
  const name = str(value).trim().toLowerCase();
  if (name === 'completed') return 'completed';
  if (name === 'paused' || name === 'stuck') return 'paused';
  return 'active';
}

function moodOf(value: unknown): MoodId | null {
  const name = str(value).trim().toLowerCase();
  return (MOOD_IDS as readonly string[]).includes(name) ? (name as MoodId) : null;
}

/** Goals stored as an array on the prototype user document. */
export function legacyGoals(data: Data | undefined): Goal[] {
  return list(data?.goals).flatMap((goal, index) => {
    const title = str(goal.title).trim();
    const id = str(goal.id).trim();
    if (!title || !id) return [];
    const progress = typeof goal.progress === 'number' && Number.isFinite(goal.progress) ? Math.min(100, Math.max(0, Math.round(goal.progress))) : 0;
    return [{ id: legacyDocId(id), title, category: categoryOf(goal.category), status: statusOf(goal.status), progress, createdAt: index, updatedAt: index }];
  });
}

/** Check-ins stored as an array. One row per calendar day; a later row wins. */
export function legacyCheckIns(data: Data | undefined): CheckIn[] {
  const byDate = new Map<string, CheckIn>();
  for (const raw of list(data?.checkIns)) {
    const date = dateKey(raw.date);
    if (!date) continue;
    const moods = Array.isArray(raw.moods) ? raw.moods.map(moodOf).filter((m): m is MoodId => m !== null) : [];
    const single = moodOf(raw.mood);
    if (single && !moods.includes(single)) moods.unshift(single);
    if (moods.length === 0) moods.push('balanced');
    const happiness = clampMetric(raw.happiness, clampMetric(raw.energy, 5));
    const createdAt = typeof raw.id === 'string' && /^\d+$/.test(raw.id) ? Number(raw.id) : Date.parse(str(raw.date)) || 0;
    byDate.set(date, {
      id: date,
      date,
      moods,
      happiness,
      stress: clampMetric(raw.stress, 5),
      sleep: clampMetric(raw.sleep, 5),
      ...(str(raw.reflection) || str(raw.notes) ? { reflection: str(raw.reflection) || str(raw.notes) } : {}),
      ...(str(raw.win) ? { win: str(raw.win) } : {}),
      createdAt,
      updatedAt: createdAt,
    });
  }
  return [...byDate.values()];
}

export function legacyJournal(data: Data | undefined): JournalEntry[] {
  return list(data?.journalEntries).flatMap((entry) => {
    const text = str(entry.text).trim();
    const id = str(entry.id).trim();
    const date = dateKey(entry.date);
    if (!text || !id || !date) return [];
    const createdAt = Date.parse(str(entry.date)) || 0;
    return [{ id: legacyDocId(id), date, text, createdAt, updatedAt: createdAt }];
  });
}

export type LegacyChat = { conversation: Conversation; messages: ChatMessage[] };

/** Chats embedded on the prototype user document. Empty placeholder sessions are skipped. */
export function legacyChats(data: Data | undefined): LegacyChat[] {
  return list(data?.chats).flatMap((chat) => {
    const rawId = str(chat.id).trim();
    if (!rawId) return [];
    const id = legacyDocId(rawId);
    const messages: ChatMessage[] = list(chat.messages).flatMap((message) => {
      const text = str(message.text).trim();
      const messageId = str(message.id).trim() ? legacyDocId(str(message.id)) : '';
      const role: MessageRole | null = message.sender === 'ai' ? 'coach' : message.sender === 'user' ? 'user' : null;
      if (!text || !messageId || !role) return [];
      const createdAt = typeof message.timestamp === 'number' ? message.timestamp : 0;
      return [{ id: messageId, role, text, clientTurnId: messageId, channel: 'text' as const, createdAt }];
    });
    const title = str(chat.title).trim();
    const mode = chat.mode === 'reflection' ? 'reflection' : 'normal';
    const edited = chat.titleManuallyEdited === true;
    if (messages.length === 0 && !edited && mode === 'normal') return [];
    const createdAt = typeof chat.createdAt === 'number' ? chat.createdAt : 0;
    const updatedAt = typeof chat.updatedAt === 'number' ? chat.updatedAt : createdAt;
    const reflection = asRecord(chat.reflectionContext);
    const reflectionCheckInId = dateKey(reflection?.date);
    const preview = messages[messages.length - 1]?.text ?? '';
    return [{
      conversation: {
        id,
        title: title || (mode === 'reflection' ? 'Reflection discussion' : 'Coaching session'),
        mode,
        ...(reflectionCheckInId ? { reflectionCheckInId } : {}),
        titleEdited: edited,
        lastMessagePreview: preview.slice(0, 140),
        createdAt,
        updatedAt,
      },
      messages,
    }];
  });
}

/** Credits written on the user document by the prototype. Absent when the field was never set. */
export function legacyAccount(data: Data | undefined): Account | null {
  if (!data || typeof data.creditsRemaining !== 'number' || !Number.isFinite(data.creditsRemaining)) return null;
  return {
    plan: data.subscriptionPlan === 'plus' ? 'plus' : 'standard',
    creditsRemaining: Math.max(0, Math.floor(data.creditsRemaining)),
    creditsPeriodKey: str(data.creditsPeriodKey),
  };
}
