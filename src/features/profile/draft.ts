import type { ProfileFields } from '@/types/models';

import { splitIsoDate, validateDob, type DobParts } from './dob';
import { normaliseText, validateProfileFields, type ProfileErrors } from './validation';

/** Form state for profile editing: like ProfileFields, but with the date of birth as typed parts. */
export type ProfileDraft = Omit<ProfileFields, 'dateOfBirth'> & { dob: DobParts };

export function draftFromProfile(fields: ProfileFields): ProfileDraft {
  const { dateOfBirth, ...rest } = fields;
  return { ...rest, dob: splitIsoDate(dateOfBirth) };
}

export type ResolvedDraft = { fields: Partial<ProfileFields>; errors: ProfileErrors };

/** Validates the requested fields of a draft and returns them in stored form. */
export function resolveDraft(draft: ProfileDraft, keys: readonly (keyof ProfileFields)[], now = new Date()): ResolvedDraft {
  const fields: Partial<ProfileFields> = {};
  const errors: ProfileErrors = {};

  for (const key of keys) {
    if (key === 'dateOfBirth') {
      const dob = validateDob(draft.dob, now);
      if (dob.ok) fields.dateOfBirth = dob.iso;
      else errors.dateOfBirth = dob.error;
      continue;
    }
    fields[key] = normaliseText(draft[key]);
  }

  const textFields = { ...fields };
  delete textFields.dateOfBirth;
  Object.assign(errors, validateProfileFields(textFields));
  return { fields, errors };
}
