import { DEFAULT_DAILY_TOKEN_LIMIT, type Account } from '@/types/models';

/** The next UTC midnight, when the daily allowance resets. */
export function nextResetAt(now = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

/** What the app assumes before the server has answered: a fresh day. */
export function defaultAccount(now = Date.now()): Account {
  return { plan: 'standard', used: 0, limit: DEFAULT_DAILY_TOKEN_LIMIT, resetsAt: nextResetAt(now) };
}

/** An account whose reset time has passed has a fresh allowance, even before the server says so. */
export function currentAccount(account: Account | null, now = Date.now()): Account {
  if (!account) return defaultAccount(now);
  if (account.resetsAt && now >= account.resetsAt) return { ...account, used: 0, resetsAt: nextResetAt(now) };
  return account;
}

/** Whole percent of today's allowance left, 0–100. */
export function percentLeft(account: Account): number {
  if (!(account.limit > 0)) return 100;
  return Math.max(0, Math.min(100, Math.round((1 - account.used / account.limit) * 100)));
}

export function isUsedUp(account: Account): boolean {
  return account.limit > 0 && account.used >= account.limit;
}

/** "at 1:00 am", or "tomorrow at 1:00 am" when that is after local midnight. */
export function resetLabel(resetsAt: number, now = Date.now()): string {
  const at = new Date(resetsAt);
  const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  const today = new Date(now);
  const sameDay = at.getFullYear() === today.getFullYear() && at.getMonth() === today.getMonth() && at.getDate() === today.getDate();
  return sameDay ? `at ${time}` : `tomorrow at ${time}`;
}

/** Tolerant read of users/{uid}/private/account. Monthly-credit docs read as a fresh day. */
export function parseAccountDoc(d: Record<string, unknown> | undefined, now = Date.now()): Account | null {
  if (!d) return null;
  const plan = d.plan === 'plus' ? 'plus' : 'standard';
  const limit = typeof d.dailyTokenLimit === 'number' && d.dailyTokenLimit > 0 ? d.dailyTokenLimit : DEFAULT_DAILY_TOKEN_LIMIT;
  const today = new Date(now).toISOString().slice(0, 10);
  const used = d.dayKey === today && typeof d.tokensUsed === 'number' ? Math.max(0, d.tokensUsed) : 0;
  if (typeof d.tokensUsed !== 'number' && typeof d.creditsRemaining !== 'number') return null;
  return { plan, used, limit, resetsAt: nextResetAt(now) };
}
