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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "9 Oct 2026". */
export function formatCheckInDate(date: IsoDate): string {
  const [y, m, d] = date.split('-').map((x) => Number.parseInt(x, 10)) as [number, number, number];
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/**
 * One honest line about their check-ins for the Insights screen: what the numbers actually
 * show, in the coach's voice, never generic praise.
 */
export function coachInsight(checkIns: readonly Pick<CheckIn, 'date' | 'stress'>[], thisWeek: number): string {
  if (checkIns.length === 0) {
    return 'Your first check-in takes a minute, and it gives your coach something real to work with.';
  }
  const recent = [...checkIns].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const stress = recent.reduce((sum, c) => sum + c.stress, 0) / recent.length;
  if (recent.length >= 3 && stress >= 7) {
    return `Stress has averaged ${Math.round(stress)}/10 across your last ${recent.length} check-ins. That might be worth talking through with your coach.`;
  }
  if (thisWeek >= 4) {
    return `${thisWeek} check-ins this week. With that many, patterns in your mood and energy start to show, so it's a good time to look at what's shifting.`;
  }
  if (thisWeek > 0) {
    return `${thisWeek} check-in${thisWeek === 1 ? '' : 's'} this week. A few more and your coach can start spotting patterns in your mood and energy.`;
  }
  return `No check-ins yet this week; your last was on ${formatCheckInDate(recent[0]!.date)}. A quick one today picks the thread back up.`;
}
