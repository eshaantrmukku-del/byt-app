import type { ProfileFields } from '@/types/models';

import { isIsoDate } from './dob';

/** Must match the size limits in firestore.rules. */
export const PROFILE_LIMITS = {
  displayName: 60,
  profession: 120,
  goalsSummary: 1000,
  income: 120,
  lifestyle: 1000,
  struggles: 1000,
  coachNotes: 2000,
} as const satisfies Record<Exclude<keyof ProfileFields, 'dateOfBirth'>, number>;

export type TextProfileField = keyof typeof PROFILE_LIMITS;

/** Needed before onboarding can be completed. The rest is optional context. */
export const REQUIRED_PROFILE_FIELDS = ['displayName', 'dateOfBirth', 'profession', 'goalsSummary'] as const;

export type ProfileErrors = Partial<Record<keyof ProfileFields, string>>;

const REQUIRED_MESSAGES: Record<(typeof REQUIRED_PROFILE_FIELDS)[number], string> = {
  displayName: 'Tell us what to call you.',
  dateOfBirth: 'Enter your date of birth.',
  profession: 'Add what you do — student, job title, or “between things”.',
  goalsSummary: 'Share at least one thing you want to work towards.',
};

export function normaliseText(value: string): string {
  return value.replace(/\r\n/g, '\n').trim();
}

/**
 * Validates the given subset of profile fields. Only keys present in `fields`
 * are checked, so each onboarding step can validate its own fields.
 */
export function validateProfileFields(fields: Partial<ProfileFields>): ProfileErrors {
  const errors: ProfileErrors = {};

  for (const key of Object.keys(fields) as (keyof ProfileFields)[]) {
    const value = fields[key];
    if (key === 'dateOfBirth') {
      if (value === null || value === undefined || value === '') {
        errors.dateOfBirth = REQUIRED_MESSAGES.dateOfBirth;
      } else if (!isIsoDate(value)) {
        errors.dateOfBirth = 'That date of birth isn’t valid.';
      }
      continue;
    }
    const text = typeof value === 'string' ? normaliseText(value) : '';
    const limit = PROFILE_LIMITS[key];
    if (text.length > limit) {
      errors[key] = `Keep this under ${limit} characters.`;
    } else if (!text && (REQUIRED_PROFILE_FIELDS as readonly string[]).includes(key)) {
      errors[key] = REQUIRED_MESSAGES[key as (typeof REQUIRED_PROFILE_FIELDS)[number]];
    }
  }
  return errors;
}

export function hasErrors(errors: ProfileErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function isProfileComplete(fields: ProfileFields): boolean {
  const required: Partial<ProfileFields> = {};
  for (const key of REQUIRED_PROFILE_FIELDS) {
    (required as Record<string, unknown>)[key] = fields[key];
  }
  return !hasErrors(validateProfileFields(required));
}
