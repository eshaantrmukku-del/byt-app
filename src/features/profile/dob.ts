/** Date of birth helpers — stored as YYYY-MM-DD, entered as day / month / year. */

export const MIN_AGE = 13;
export const MAX_AGE = 100;

export type DobParts = { day: string; month: string; year: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function pad2(n: number | string): string {
  return String(n).padStart(2, '0');
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATE.test(value);
}

/** Build ISO date from day/month/year strings. Returns null if not a real calendar date. */
export function composeIsoDate(day: string, month: string, year: string): string | null {
  const d = Number.parseInt(day, 10);
  const m = Number.parseInt(month, 10);
  const y = Number.parseInt(year, 10);
  if (!d || !m || !y || y < 1900) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function splitIsoDate(iso: string | null | undefined): DobParts {
  if (!isIsoDate(iso)) return { day: '', month: '', year: '' };
  const [y = '', m = '', d = ''] = iso.split('-');
  return { day: String(Number.parseInt(d, 10)), month: String(Number.parseInt(m, 10)), year: y };
}

/** Age in full years on `now` (local time). */
export function ageFromIsoDate(iso: string, now = new Date()): number | null {
  if (!isIsoDate(iso)) return null;
  const [y, m, d] = iso.split('-').map((x) => Number.parseInt(x, 10)) as [number, number, number];
  let age = now.getFullYear() - y;
  const hadBirthday = now.getMonth() + 1 > m || (now.getMonth() + 1 === m && now.getDate() >= d);
  if (!hadBirthday) age -= 1;
  return age;
}

export function formatDob(iso: string | null): string {
  const { day, month, year } = splitIsoDate(iso);
  if (!day) return '';
  return `${pad2(day)}/${pad2(month)}/${year}`;
}

export type DobResult = { ok: true; iso: string } | { ok: false; error: string };

export function validateDob(parts: DobParts, now = new Date()): DobResult {
  const day = parts.day.trim();
  const month = parts.month.trim();
  const year = parts.year.trim();
  if (!day || !month || !year) {
    return { ok: false, error: 'Enter your full date of birth.' };
  }
  if (!/^\d{1,2}$/.test(day) || !/^\d{1,2}$/.test(month) || !/^\d{4}$/.test(year)) {
    return { ok: false, error: 'Use numbers: day, month and a 4-digit year.' };
  }
  const iso = composeIsoDate(day, month, year);
  const age = iso ? ageFromIsoDate(iso, now) : null;
  if (!iso || age === null || age < 0) {
    return { ok: false, error: 'That date doesn’t exist. Check the day, month and year.' };
  }
  if (age < MIN_AGE) return { ok: false, error: `You need to be at least ${MIN_AGE} to use BYT.` };
  if (age > MAX_AGE) return { ok: false, error: 'Please enter your real date of birth.' };
  return { ok: true, iso };
}
