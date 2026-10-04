import { describe, expect, it } from 'vitest';

import { computeStreaks, toggleMood } from '@/features/checkIns/checkIns';
import { addDays, localDateKey } from '@/features/dates';
import { diffGoal, NEW_GOAL_DRAFT, normaliseProgress, resolveGoalDraft } from '@/features/goals/goals';
import { prepareJournalText, sortJournal } from '@/features/journal/journal';
import { parseAccount, parseCheckIn, parseGoal, parseJournalEntry, toMillis } from '@/features/parse';
import type { JournalEntry } from '@/types/models';

describe('dates', () => {
  it('formats local date keys and does day arithmetic across month/year/DST boundaries', () => {
    expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30'); // UK clocks change 29 Mar
  });
});

describe('computeStreaks', () => {
  const today = '2026-10-04';

  it('is zero with no check-ins', () => {
    expect(computeStreaks([], today)).toEqual({ current: 0, best: 0, checkedInToday: false });
  });

  it('counts consecutive days ending today', () => {
    expect(computeStreaks(['2026-10-04', '2026-10-03', '2026-10-02'], today)).toEqual({
      current: 3,
      best: 3,
      checkedInToday: true,
    });
  });

  it('keeps yesterday’s streak alive until today ends', () => {
    expect(computeStreaks(['2026-10-03', '2026-10-02'], today)).toMatchObject({ current: 2, checkedInToday: false });
  });

  it('breaks on a missed day but remembers the best run', () => {
    const dates = ['2026-10-04', '2026-10-02', '2026-10-01', '2026-09-30', '2026-09-29'];
    expect(computeStreaks(dates, today)).toEqual({ current: 1, best: 4, checkedInToday: true });
    expect(computeStreaks(['2026-10-01', '2026-09-30'], today).current).toBe(0);
  });

  it('ignores duplicates and order', () => {
    expect(computeStreaks(['2026-10-03', '2026-10-04', '2026-10-03'], today).current).toBe(2);
  });
});

describe('mood selection', () => {
  it('toggles moods but always keeps at least one', () => {
    expect(toggleMood(['energized'], 'calm')).toEqual(['energized', 'calm']);
    expect(toggleMood(['energized', 'calm'], 'energized')).toEqual(['calm']);
    expect(toggleMood(['calm'], 'calm')).toEqual(['calm']);
  });
});

describe('goals', () => {
  it('requires a title and normalises whitespace', () => {
    expect(resolveGoalDraft({ ...NEW_GOAL_DRAFT, title: '   ' }).ok).toBe(false);
    const r = resolveGoalDraft({ ...NEW_GOAL_DRAFT, title: '  Run   a 10k ' });
    expect(r.ok && r.goal.title).toBe('Run a 10k');
  });

  it('links 100% progress and completion', () => {
    const atFull = resolveGoalDraft({ ...NEW_GOAL_DRAFT, title: 'x', progress: 100 });
    expect(atFull.ok && atFull.goal.status).toBe('completed');
    const completed = resolveGoalDraft({ ...NEW_GOAL_DRAFT, title: 'x', status: 'completed', progress: 40 });
    expect(completed.ok && completed.goal.progress).toBe(100);
    const paused = resolveGoalDraft({ ...NEW_GOAL_DRAFT, title: 'x', status: 'paused', progress: 100 });
    expect(paused.ok && paused.goal.status).toBe('paused');
  });

  it('clamps progress and diffs changed fields only', () => {
    expect(normaliseProgress(130)).toBe(100);
    expect(normaliseProgress(-5)).toBe(0);
    expect(normaliseProgress(42.6)).toBe(43);
    expect(diffGoal(NEW_GOAL_DRAFT, { ...NEW_GOAL_DRAFT, progress: 20 })).toEqual({ progress: 20 });
  });

});

describe('journal', () => {
  it('treats blank text as nothing to save', () => {
    expect(prepareJournalText('')).toBeNull();
    expect(prepareJournalText('   \n\t ')).toBeNull();
    expect(prepareJournalText('  Hello\r\nworld  ')).toBe('Hello\nworld');
  });

  it('sorts newest first', () => {
    const e = (id: string, createdAt: number): JournalEntry => ({ id, date: '2026-10-04', text: id, createdAt, updatedAt: createdAt });
    expect(sortJournal([e('old', 1), e('new', 3), e('mid', 2)]).map((x) => x.id)).toEqual(['new', 'mid', 'old']);
  });
});

describe('parsing Firestore documents', () => {
  const ts = { toMillis: () => 1234 };

  it('reads timestamps and falls back when pending', () => {
    expect(toMillis(ts)).toBe(1234);
    expect(toMillis(null, 99)).toBe(99);
  });

  it('parses valid docs and skips malformed ones', () => {
    expect(parseGoal('g', { title: 'Run', category: 'health', status: 'active', progress: 30, createdAt: ts, updatedAt: ts }))
      .toMatchObject({ id: 'g', progress: 30, createdAt: 1234 });
    expect(parseGoal('g', { title: '' })).toBeNull();
    expect(parseGoal('g', { title: 'x', category: 'bogus', status: 'bogus', progress: 500 })).toMatchObject({
      category: 'other', status: 'active', progress: 100,
    });

    const checkIn = { moods: ['calm', 'bogus'], happiness: 7, stress: 3, sleep: 8, win: 'Gym', createdAt: ts, updatedAt: ts };
    expect(parseCheckIn('2026-10-04', checkIn)).toMatchObject({ date: '2026-10-04', moods: ['calm'], happiness: 7, win: 'Gym' });
    expect(parseCheckIn('2026-10-04', { ...checkIn, happiness: 11 })).toBeNull();
    expect(parseCheckIn('2026-10-04', { ...checkIn, moods: [] })).toBeNull();
    expect(parseCheckIn('today', checkIn)).toBeNull();

    expect(parseJournalEntry('j', { date: '2026-10-04', text: 'hi', createdAt: ts })).toMatchObject({ text: 'hi', updatedAt: 1234 });
    expect(parseJournalEntry('j', { text: '' })).toBeNull();
  });

  it('reads the server-owned account doc', () => {
    expect(parseAccount(undefined)).toBeNull();
    expect(parseAccount({ plan: 'standard', creditsRemaining: 148.7, creditsPeriodKey: '2026-10' })).toEqual({
      plan: 'standard', creditsRemaining: 148, creditsPeriodKey: '2026-10',
    });
  });
});
