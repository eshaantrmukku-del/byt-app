import { GOAL_CATEGORIES, GOAL_STATUSES, type GoalCategory, type GoalStatus } from '@/types/models';

import { normaliseText } from '../profile/validation';

/** Must match firestore.rules. */
export const GOAL_TITLE_LIMIT = 200;

export const CATEGORY_LABELS: Record<GoalCategory, string> = {
  career: 'Career',
  health: 'Health',
  fitness: 'Fitness',
  personal: 'Personal',
  finance: 'Finance',
  learning: 'Learning',
  social: 'Social',
  creativity: 'Creativity',
  other: 'Other',
};

/** Categories offered when creating a goal, in the prototype's order. */
export const PICKABLE_CATEGORIES: readonly GoalCategory[] = [
  'career',
  'health',
  'fitness',
  'personal',
  'finance',
  'learning',
  'social',
  'creativity',
];

export type GoalDraft = { title: string; category: GoalCategory; status: GoalStatus; progress: number };

export const NEW_GOAL_DRAFT: GoalDraft = { title: '', category: 'career', status: 'active', progress: 0 };

export function normaliseProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export type ResolvedGoal = { ok: true; goal: GoalDraft } | { ok: false; error: string };

export function resolveGoalDraft(draft: GoalDraft): ResolvedGoal {
  const title = normaliseText(draft.title).replace(/\s+/g, ' ');
  if (!title) return { ok: false, error: 'Give your goal a short name.' };
  if (title.length > GOAL_TITLE_LIMIT) return { ok: false, error: `Keep it under ${GOAL_TITLE_LIMIT} characters.` };
  if (!GOAL_CATEGORIES.includes(draft.category) || !GOAL_STATUSES.includes(draft.status)) {
    return { ok: false, error: 'Something about this goal isn’t valid.' };
  }
  const progress = normaliseProgress(draft.progress);
  // Finishing a goal and reaching 100% go together.
  const status = progress === 100 && draft.status === 'active' ? 'completed' : draft.status;
  return { ok: true, goal: { title, category: draft.category, status, progress: status === 'completed' ? 100 : progress } };
}

/** Fields of `next` that differ from `current`. */
export function diffGoal(current: GoalDraft, next: GoalDraft): Partial<GoalDraft> {
  const changes: Partial<GoalDraft> = {};
  for (const key of ['title', 'category', 'status', 'progress'] as const) {
    if (current[key] !== next[key]) (changes as Record<string, unknown>)[key] = next[key];
  }
  return changes;
}
