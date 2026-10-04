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
