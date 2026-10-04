import type { IsoDate } from '@/types/models';

import { pad2 } from './profile/dob';

/** The user's local calendar date as YYYY-MM-DD. */
export function localDateKey(date = new Date()): IsoDate {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function keyToUtc(key: IsoDate): number {
  const [y, m, d] = key.split('-').map((x) => Number.parseInt(x, 10)) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

/** Date-key arithmetic in UTC so daylight-saving changes never skip or repeat a day. */
export function addDays(key: IsoDate, days: number): IsoDate {
  const dt = new Date(keyToUtc(key) + days * 86_400_000);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((keyToUtc(to) - keyToUtc(from)) / 86_400_000);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Today", "Yesterday", or e.g. "Mon 3 Oct" (adds the year if it isn't this year). */
export function formatDayLabel(key: IsoDate, today: IsoDate = localDateKey()): string {
  const diff = daysBetween(key, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  const dt = new Date(keyToUtc(key));
  const label = `${WEEKDAYS[dt.getUTCDay()]} ${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}`;
  return key.slice(0, 4) === today.slice(0, 4) ? label : `${label} ${key.slice(0, 4)}`;
}

export function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
