import { PROFILE_SCHEMA_VERSION, type ProfileFields, type UserProfile } from '@/types/models';

import { isIsoDate } from './dob';
import { isProfileComplete, normaliseText, PROFILE_LIMITS, type TextProfileField } from './validation';

type DocData = Record<string, unknown>;

export const PROFILE_FIELD_KEYS = [
  'displayName',
  'dateOfBirth',
  'profession',
  'goalsSummary',
  'income',
  'lifestyle',
  'struggles',
  'coachNotes',
] as const satisfies readonly (keyof ProfileFields)[];

export const EMPTY_PROFILE_FIELDS: ProfileFields = {
  displayName: '',
  dateOfBirth: null,
  profession: '',
  goalsSummary: '',
  income: '',
  lifestyle: '',
  struggles: '',
  coachNotes: '',
};

function str(data: DocData | undefined, key: string): string {
  const value = data?.[key];
  return typeof value === 'string' ? value : '';
}

function clip(field: TextProfileField, value: string): string {
  return normaliseText(value).slice(0, PROFILE_LIMITS[field]);
}

export function isCurrentSchema(data: DocData | undefined): boolean {
  return data?.schemaVersion === PROFILE_SCHEMA_VERSION;
}

/** Tolerant read of a schema-v2 profile document into app state. */
export function parseProfile(data: DocData): UserProfile {
  const dob = data.dateOfBirth;
  return {
    displayName: str(data, 'displayName'),
    dateOfBirth: isIsoDate(dob) ? dob : null,
    profession: str(data, 'profession'),
    goalsSummary: str(data, 'goalsSummary'),
    income: str(data, 'income'),
    lifestyle: str(data, 'lifestyle'),
    struggles: str(data, 'struggles'),
    coachNotes: str(data, 'coachNotes'),
    email: str(data, 'email'),
    onboardingCompleted: data.onboardingCompleted === true,
  };
}

export type Identity = { displayName: string; email: string };

/** Initial profile written once at sign-up (timestamps added by the service). */
export function buildNewProfile(identity: Identity) {
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    ...EMPTY_PROFILE_FIELDS,
    displayName: clip('displayName', identity.displayName),
    email: identity.email,
    onboardingCompleted: false,
  };
}

/**
 * Carries a prototype (schema v1) profile into schema v2 without losing anything.
 * Returns only the fields to add; legacy fields (goals, chats, …) are left as they are.
 */
export function buildLegacyUpgrade(data: DocData, identity: Identity) {
  const legacy = (typeof data.coachProfile === 'object' && data.coachProfile !== null
    ? data.coachProfile
    : {}) as DocData;
  const dob = legacy.dateOfBirth;

  const fields: ProfileFields = {
    displayName: clip('displayName', str(data, 'displayName') || identity.displayName),
    dateOfBirth: isIsoDate(dob) ? dob : null,
    profession: clip('profession', str(legacy, 'profession')),
    goalsSummary: clip('goalsSummary', str(legacy, 'goalsSummary')),
    income: clip('income', str(legacy, 'income')),
    lifestyle: clip('lifestyle', str(legacy, 'lifestyleNotes')),
    struggles: clip('struggles', str(legacy, 'struggles')),
    coachNotes: clip('coachNotes', str(legacy, 'coachNotes')),
  };

  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    ...fields,
    email: str(data, 'email') || identity.email,
    // Only skip onboarding if the old profile already has everything BYT needs.
    onboardingCompleted: data.onboardingCompleted === true && isProfileComplete(fields),
  };
}

/** Normalised fields from `next` that differ from `current`. Empty object = nothing to save. */
export function diffProfileFields(current: ProfileFields, next: ProfileFields): Partial<ProfileFields> {
  const changes: Partial<ProfileFields> = {};
  for (const key of PROFILE_FIELD_KEYS) {
    if (key === 'dateOfBirth') {
      if (next.dateOfBirth !== current.dateOfBirth) changes.dateOfBirth = next.dateOfBirth;
      continue;
    }
    const value = normaliseText(next[key]);
    if (value !== current[key]) changes[key] = value;
  }
  return changes;
}
