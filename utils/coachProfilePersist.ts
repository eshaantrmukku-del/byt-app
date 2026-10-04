import type { CoachProfile } from '@/store/useStore';

function trimmed(value: string | undefined): string {
  return value?.trim() ?? '';
}

function optional(value: string | undefined): string | undefined {
  const next = value?.trim();
  return next ? next : undefined;
}

/** Build the in-memory profile. Blank optional fields are omitted; text is kept as typed. */
export function toCoachProfile(input: {
  dateOfBirth?: string;
  age?: string;
  profession: string;
  goalsSummary: string;
  income?: string;
  lifestyleNotes?: string;
  struggles?: string;
  coachNotes?: string;
}): CoachProfile {
  const dateOfBirth = optional(input.dateOfBirth);
  const age = optional(input.age);
  return {
    ...(dateOfBirth ? { dateOfBirth } : {}),
    ...(age ? { age } : {}),
    profession: trimmed(input.profession),
    goalsSummary: trimmed(input.goalsSummary),
    income: optional(input.income),
    lifestyleNotes: optional(input.lifestyleNotes),
    struggles: optional(input.struggles),
    coachNotes: optional(input.coachNotes),
  };
}

export function coachProfileHasContent(profile: CoachProfile | null | undefined): boolean {
  if (!profile) return false;
  return !!(
    profile.profession?.trim() ||
    profile.goalsSummary?.trim() ||
    profile.dateOfBirth?.trim() ||
    profile.age?.trim() ||
    profile.income?.trim() ||
    profile.lifestyleNotes?.trim() ||
    profile.struggles?.trim() ||
    profile.coachNotes?.trim()
  );
}

/**
 * Full map written to Firestore. Every key is present so a merge cannot
 * leave a stale income, lifestyle, struggle, or coach note behind.
 */
export function serializeCoachProfile(profile: CoachProfile | null | undefined): Record<string, string> | null {
  if (!profile || !coachProfileHasContent(profile)) return null;
  return {
    dateOfBirth: trimmed(profile.dateOfBirth),
    age: trimmed(profile.age),
    profession: trimmed(profile.profession),
    goalsSummary: trimmed(profile.goalsSummary),
    income: trimmed(profile.income),
    lifestyleNotes: trimmed(profile.lifestyleNotes),
    struggles: trimmed(profile.struggles),
    coachNotes: trimmed(profile.coachNotes),
  };
}

export function parseCoachProfile(raw: unknown): CoachProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const str = (key: string) => (typeof record[key] === 'string' ? record[key] : '');
  const profile = toCoachProfile({
    dateOfBirth: str('dateOfBirth'),
    age: str('age'),
    profession: str('profession'),
    goalsSummary: str('goalsSummary'),
    income: str('income'),
    lifestyleNotes: str('lifestyleNotes'),
    struggles: str('struggles'),
    coachNotes: str('coachNotes'),
  });
  return coachProfileHasContent(profile) ? profile : null;
}
