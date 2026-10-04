/** Date of birth helpers — stored as YYYY-MM-DD, entered as day / month / year. */

export const MIN_AGE = 13;
export const MAX_AGE = 100;

export type DobParts = { day: string; month: string; year: string };

export function pad2(n: number | string): string {
  return String(n).padStart(2, '0');
}

/** Build ISO date from day/month/year strings. Returns null if incomplete. */
export function composeIsoDate(day: string, month: string, year: string): string | null {
  const d = parseInt(day, 10);
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);
  if (!d || !m || !y) return null;
  if (y < 1900 || y > new Date().getFullYear()) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;
  const iso = `${y}-${pad2(m)}-${pad2(d)}`;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null; // invalid calendar date e.g. 31/02
  }
  return iso;
}

export function splitIsoDate(iso: string | undefined | null): DobParts {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return { day: '', month: '', year: '' };
  }
  const [y, m, d] = iso.split('-');
  return { day: String(parseInt(d, 10)), month: String(parseInt(m, 10)), year: y };
}

/** Age in full years as of today (local time). */
export function ageFromIsoDate(iso: string, now = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [ys, ms, ds] = iso.split('-').map((x) => parseInt(x, 10));
  const birth = new Date(ys, ms - 1, ds);
  if (Number.isNaN(birth.getTime())) return null;
  let age = now.getFullYear() - birth.getFullYear();
  const hadBirthday =
    now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!hadBirthday) age -= 1;
  return age;
}

export function formatDobDisplay(iso: string): string {
  const { day, month, year } = splitIsoDate(iso);
  if (!day || !month || !year) return iso;
  return `${pad2(day)}/${pad2(month)}/${year}`;
}

/**
 * Validate day/month/year for coaching profile.
 * Returns { ok, iso, age } or { ok: false, error }.
 */
export function validateDobInput(
  day: string,
  month: string,
  year: string
): { ok: true; iso: string; age: number } | { ok: false; error: string } {
  const d = day.trim();
  const m = month.trim();
  const y = year.trim();
  if (!d || !m || !y) {
    return { ok: false, error: 'Please enter your full date of birth (day, month, and year).' };
  }
  if (!/^\d{1,2}$/.test(d) || !/^\d{1,2}$/.test(m) || !/^\d{4}$/.test(y)) {
    return { ok: false, error: 'Use numbers only — day, month, and a 4-digit year.' };
  }
  const iso = composeIsoDate(d, m, y);
  if (!iso) {
    return { ok: false, error: 'That date isn’t valid. Check day, month, and year.' };
  }
  const age = ageFromIsoDate(iso);
  if (age === null) {
    return { ok: false, error: 'That date isn’t valid. Check day, month, and year.' };
  }
  if (age < MIN_AGE) {
    return { ok: false, error: `You must be at least ${MIN_AGE} to use BYT.` };
  }
  if (age > MAX_AGE) {
    return {
      ok: false,
      error: `Please enter a realistic date of birth (ages ${MIN_AGE}–${MAX_AGE}).`,
    };
  }
  return { ok: true, iso, age };
}
