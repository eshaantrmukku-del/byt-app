import { describe, expect, it } from 'vitest';

import { parseCommitments, planNotifications, resolveWhen, type CoachCommitment } from '@/features/notifications/plan';

// Wednesday 28 October 2026, 10:00 local time.
const WED = new Date(2026, 9, 28, 10, 0);
const base = { now: WED, checkInReminders: false, nudges: false, reminderHour: 20, checkedIn: new Set<string>(), commitments: [] };
const commitment = (over: Partial<CoachCommitment> = {}): CoachCommitment => ({
  id: 'c1',
  text: 'talk to my manager about moving teams',
  when: 'on Friday',
  createdAt: WED.getTime(),
  status: 'open',
  ...over,
});
const local = (d: Date) => `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;

describe('resolveWhen', () => {
  it('reads the day from their own words', () => {
    expect(resolveWhen('tonight', WED)).toEqual({ day: '2026-10-28', evening: true });
    expect(resolveWhen('tomorrow morning', WED)).toEqual({ day: '2026-10-29', evening: false });
    expect(resolveWhen('on Friday', WED)?.day).toBe('2026-10-30');
    expect(resolveWhen('by Monday', WED)?.day).toBe('2026-11-02');
    expect(resolveWhen('next Wednesday', WED)?.day).toBe('2026-11-04');
    expect(resolveWhen('this weekend', WED)?.day).toBe('2026-10-31');
    expect(resolveWhen('in 3 days', WED)?.day).toBe('2026-10-31');
  });

  it('gives up on vague timing rather than guessing', () => {
    expect(resolveWhen('soon', WED)).toBeNull();
    expect(resolveWhen('this week', WED)).toBeNull();
    expect(resolveWhen(null, WED)).toBeNull();
  });
});

describe('planNotifications', () => {
  it('reminds daily at the chosen hour, skipping days already checked in', () => {
    const plan = planNotifications({ ...base, checkInReminders: true, reminderHour: 8, checkedIn: new Set(['2026-10-29']) });
    // Today's 8 am has passed and tomorrow is done, so the first is Friday.
    expect(plan.map((n) => local(n.at))).toEqual(['10/30 8:00', '10/31 8:00', '11/1 8:00', '11/2 8:00', '11/3 8:00']);
    expect(plan.every((n) => n.url === '/check-in')).toBe(true);
  });

  it('nudges on the day of a commitment and follows up the day after', () => {
    const plan = planNotifications({ ...base, nudges: true, commitments: [commitment()] });
    const byId = Object.fromEntries(plan.map((n) => [n.id, n]));
    expect(local(byId['commit-c1-day']!.at)).toBe('10/30 9:00');
    expect(byId['commit-c1-day']!.title).toBe('Today: talk to my manager about moving teams');
    expect(local(byId['commit-c1-followup']!.at)).toBe('10/31 18:30');
    expect(local(byId.away!.at)).toBe('10/31 18:00');
  });

  it('follows up two days later when there was no day, and ignores closed or stale commitments', () => {
    const plan = planNotifications({
      ...base,
      nudges: true,
      commitments: [
        commitment({ id: 'vague', when: 'soon' }),
        commitment({ id: 'done', status: 'kept' }),
        commitment({ id: 'old', createdAt: WED.getTime() - 20 * 86_400_000 }),
      ],
    });
    expect(plan.map((n) => n.id).sort()).toEqual(['away', 'commit-vague-followup']);
    expect(local(plan.find((n) => n.id === 'commit-vague-followup')!.at)).toBe('10/30 18:30');
  });

  it('schedules nothing when both are switched off', () => {
    expect(planNotifications({ ...base, commitments: [commitment()] })).toEqual([]);
  });
});

describe('parseCommitments', () => {
  it('keeps well-formed commitments only', () => {
    const raw = { commitments: [{ id: 'a', text: 'x', when: null, createdAt: 1, status: 'open' }, { id: 'b' }, null] };
    expect(parseCommitments(raw)).toEqual([{ id: 'a', text: 'x', when: null, createdAt: 1, status: 'open' }]);
    expect(parseCommitments(undefined)).toEqual([]);
  });
});
