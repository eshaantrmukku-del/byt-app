import type { CheckIn, Goal, GoalCategory, IsoDate } from '@/types/models';

import { MOODS } from '../checkIns/checkIns';
import { addDays } from '../dates';
import { CATEGORY_LABELS } from '../goals/goals';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export type WeekDay = { date: IsoDate; label: string; checkedIn: boolean; isToday: boolean };

/** Monday-to-Sunday week containing `today`. */
export function weekActivity(checkInDates: Iterable<IsoDate>, today: IsoDate): WeekDay[] {
  const dates = new Set(checkInDates);
  const [y, m, d] = today.split('-').map((x) => Number.parseInt(x, 10)) as [number, number, number];
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Monday = 0
  const monday = addDays(today, -weekday);
  return DAY_LETTERS.map((label, i) => {
    const date = addDays(monday, i);
    return { date, label, checkedIn: dates.has(date), isToday: date === today };
  });
}

const CATEGORY_COLORS: Partial<Record<GoalCategory, string>> = {
  career: '#2563EB',
  health: '#22C55E',
  fitness: '#16A34A',
  learning: '#7C3AED',
  finance: '#F59E0B',
  social: '#F43F5E',
};

export type FocusArea = { category: GoalCategory; label: string; value: number; color: string };

/** Top three goal categories by share of goals, as whole percentages. */
export function focusAreas(goals: readonly Goal[]): FocusArea[] {
  if (goals.length === 0) return [];
  const counts = new Map<GoalCategory, number>();
  goals.forEach((g) => counts.set(g.category, (counts.get(g.category) ?? 0) + 1));
  return [...counts.entries()]
    .map(([category, count]) => ({
      category,
      label: CATEGORY_LABELS[category],
      value: Math.round((count / goals.length) * 100),
      color: CATEGORY_COLORS[category] ?? '#64748B',
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);
}

export function moodLabels(checkIn: Pick<CheckIn, 'moods'>): string {
  return checkIn.moods.map((id) => MOODS.find((m) => m.id === id)?.label ?? id).join(', ');
}

export function formatCheckInDate(date: IsoDate): string {
  const [y, m, d] = date.split('-').map((x) => Number.parseInt(x, 10)) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
