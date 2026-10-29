import { addDays, localDateKey } from '@/features/dates';
import type { IsoDate } from '@/types/models';

/** A commitment as the coach stored it (users/{uid}/private/coach). */
export type CoachCommitment = {
  id: string;
  text: string;
  /** Their own words for when ("on Friday", "tonight"), or null. */
  when: string | null;
  /** Epoch ms. */
  createdAt: number;
  status: 'open' | 'kept' | 'partial' | 'missed';
};

export type PlannedNotification = {
  id: string;
  title: string;
  body: string;
  at: Date;
  /** The screen a tap opens. */
  url: '/check-in' | '/ai-coach';
};

export type NotificationInputs = {
  now: Date;
  checkInReminders: boolean;
  nudges: boolean;
  /** Local hour (0–23) for the daily check-in reminder. */
  reminderHour: number;
  checkedIn: ReadonlySet<IsoDate>;
  commitments: readonly CoachCommitment[];
};

/** How far ahead to schedule; the plan is rebuilt whenever the app opens. */
const DAYS_AHEAD = 7;
/** Commitments older than this no longer get nudges. */
const COMMITMENT_WINDOW_DAYS = 14;
/** Quiet days before a "welcome back" nudge. */
const AWAY_DAYS = 3;
/** Android keeps a limited number of alarms per app; stay well under it. */
const MAX_SCHEDULED = 30;

const CHECK_IN_LINES = [
  'Two minutes to notice how today went.',
  'How was today, really? Your check-in is ready.',
  "A quick check-in keeps your coach in the loop.",
  'Mood, energy, one win. That’s all it takes.',
];

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const at = (key: IsoDate, hour: number, minute = 0): Date => {
  const [y, m, d] = key.split('-').map((x) => Number.parseInt(x, 10)) as [number, number, number];
  return new Date(y, m - 1, d, hour, minute);
};

/**
 * The day a commitment is for, from their own words: "today", "tonight", "tomorrow",
 * a weekday ("on Friday", "by next Monday"), "this weekend" or "in 3 days".
 * Returns null when there's no specific day ("soon", "this week").
 */
export function resolveWhen(when: string | null, createdAt: Date): { day: IsoDate; evening: boolean } | null {
  if (!when) return null;
  const text = when.toLowerCase();
  const created = localDateKey(createdAt);
  const evening = /\b(tonight|this evening|after work|evening)\b/.test(text);
  if (/\b(today|tonight|this (morning|afternoon|evening)|after work|later)\b/.test(text)) return { day: created, evening };
  if (/\btomorrow\b/.test(text)) return { day: addDays(created, 1), evening };
  const inDays = text.match(/\bin (\d{1,2}|a couple of|two|three) days?\b/);
  if (inDays) {
    const n = { 'a couple of': 2, two: 2, three: 3 }[inDays[1] as string] ?? Number.parseInt(inDays[1]!, 10);
    return { day: addDays(created, n), evening };
  }
  const weekend = /\b(this |the )?weekend\b/.test(text);
  const dayIndex = weekend ? 6 : WEEKDAYS.findIndex((d) => new RegExp(`\\b${d}\\b`).test(text));
  if (dayIndex < 0) return null;
  let ahead = (dayIndex - createdAt.getDay() + 7) % 7;
  // "Next Friday" said on a Friday means a week away; otherwise the nearest one.
  if (ahead === 0 && /\bnext\b/.test(text)) ahead = 7;
  return { day: addDays(created, ahead), evening };
}

const quote = (text: string) => (text.length > 70 ? `${text.slice(0, 67).trimEnd()}…` : text);

/** Everything that should be scheduled right now. Rebuilt in full on every change. */
export function planNotifications(i: NotificationInputs): PlannedNotification[] {
  const out: PlannedNotification[] = [];
  const today = localDateKey(i.now);
  const add = (n: PlannedNotification) => {
    if (n.at.getTime() > i.now.getTime() + 60_000) out.push(n);
  };

  if (i.checkInReminders) {
    for (let d = 0; d < DAYS_AHEAD; d++) {
      const day = addDays(today, d);
      if (i.checkedIn.has(day)) continue;
      add({
        id: `checkin-${day}`,
        title: 'Time for your check-in',
        body: CHECK_IN_LINES[d % CHECK_IN_LINES.length]!,
        at: at(day, i.reminderHour),
        url: '/check-in',
      });
    }
  }

  if (i.nudges) {
    const since = i.now.getTime() - COMMITMENT_WINDOW_DAYS * 86_400_000;
    for (const c of i.commitments) {
      if (c.status !== 'open' || c.createdAt < since) continue;
      const created = new Date(c.createdAt);
      const due = resolveWhen(c.when, created);
      if (due) {
        add({
          id: `commit-${c.id}-day`,
          title: due.evening ? `Tonight: ${quote(c.text)}` : `Today: ${quote(c.text)}`,
          body: 'You told your coach you’d do this. Want to talk it through first?',
          at: at(due.day, due.evening ? 17 : 9),
          url: '/ai-coach',
        });
      }
      add({
        id: `commit-${c.id}-followup`,
        title: 'How did it go?',
        body: `“${quote(c.text)}” — tell your coach what happened, whichever way it went.`,
        at: at(due ? addDays(due.day, 1) : addDays(localDateKey(created), 2), 18, 30),
        url: '/ai-coach',
      });
    }
    add({
      id: 'away',
      title: 'Your coach is here when you’re ready',
      body: 'No catching up needed. Start from wherever you are today.',
      at: at(addDays(today, AWAY_DAYS), 18),
      url: '/ai-coach',
    });
  }

  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_SCHEDULED);
}

/** Reads the coach memory document's commitments defensively. */
export function parseCommitments(raw: unknown): CoachCommitment[] {
  const list = raw && typeof raw === 'object' ? (raw as { commitments?: unknown }).commitments : null;
  if (!Array.isArray(list)) return [];
  return list.flatMap((c: Record<string, unknown>) =>
    c && typeof c.id === 'string' && typeof c.text === 'string' && typeof c.createdAt === 'number' &&
    ['open', 'kept', 'partial', 'missed'].includes(c.status as string)
      ? [{ id: c.id, text: c.text, when: typeof c.when === 'string' ? c.when : null, createdAt: c.createdAt, status: c.status as CoachCommitment['status'] }]
      : []
  );
}
