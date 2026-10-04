import { describe, expect, it } from 'vitest';

import { validateDob } from '@/features/profile/dob';
import { draftFromProfile, resolveDraft } from '@/features/profile/draft';
import {
  buildLegacyUpgrade,
  buildNewProfile,
  diffProfileFields,
  EMPTY_PROFILE_FIELDS,
  parseProfile,
} from '@/features/profile/profileDoc';
import { isProfileComplete, validateProfileFields } from '@/features/profile/validation';

const NOW = new Date(2026, 9, 4);
const identity = { displayName: 'Sam', email: 'sam@example.com' };

describe('validateDob', () => {
  it('accepts a real date for an adult', () => {
    expect(validateDob({ day: '2', month: '1', year: '2000' }, NOW)).toEqual({ ok: true, iso: '2000-01-02' });
  });
  it('rejects impossible dates', () => {
    expect(validateDob({ day: '31', month: '2', year: '2000' }, NOW).ok).toBe(false);
  });
  it('rejects under-13s and future dates', () => {
    expect(validateDob({ day: '1', month: '1', year: '2020' }, NOW).ok).toBe(false);
    expect(validateDob({ day: '1', month: '1', year: '2030' }, NOW).ok).toBe(false);
  });
  it('requires all parts', () => {
    expect(validateDob({ day: '', month: '1', year: '2000' }, NOW).ok).toBe(false);
  });
});

describe('validateProfileFields', () => {
  it('requires the core fields', () => {
    const errors = validateProfileFields({ displayName: '  ', profession: '', goalsSummary: '', dateOfBirth: null });
    expect(Object.keys(errors).sort()).toEqual(['dateOfBirth', 'displayName', 'goalsSummary', 'profession']);
  });
  it('allows optional fields to be empty and enforces limits', () => {
    expect(validateProfileFields({ income: '', struggles: '' })).toEqual({});
    expect(validateProfileFields({ coachNotes: 'x'.repeat(2001) }).coachNotes).toBeDefined();
  });
});

describe('profile documents', () => {
  it('builds a new profile with every schema field and onboarding pending', () => {
    const doc = buildNewProfile(identity);
    expect(doc).toMatchObject({ schemaVersion: 2, displayName: 'Sam', email: 'sam@example.com', onboardingCompleted: false });
    expect(Object.keys(doc).sort()).toEqual(
      [...Object.keys(EMPTY_PROFILE_FIELDS), 'schemaVersion', 'email', 'onboardingCompleted'].sort()
    );
  });

  it('carries over a complete legacy profile', () => {
    const legacy = {
      displayName: 'Sam L',
      email: 'sam@example.com',
      onboardingCompleted: true,
      coachProfile: {
        dateOfBirth: '1999-05-06',
        profession: 'Designer',
        goalsSummary: 'Launch a studio',
        lifestyleNotes: 'Early riser',
        struggles: 'Focus',
        coachNotes: 'Be direct',
        income: '',
      },
      goals: [{ id: '1' }],
    };
    const upgrade = buildLegacyUpgrade(legacy, identity);
    expect(upgrade).toMatchObject({
      schemaVersion: 2,
      displayName: 'Sam L',
      dateOfBirth: '1999-05-06',
      profession: 'Designer',
      goalsSummary: 'Launch a studio',
      lifestyle: 'Early riser',
      coachNotes: 'Be direct',
      onboardingCompleted: true,
    });
    expect(upgrade).not.toHaveProperty('goals');
  });

  it('sends incomplete legacy profiles back through onboarding', () => {
    const upgrade = buildLegacyUpgrade({ onboardingCompleted: true, coachProfile: { age: '25' } }, identity);
    expect(upgrade.onboardingCompleted).toBe(false);
    expect(upgrade.displayName).toBe('Sam');
    expect(upgrade.email).toBe('sam@example.com');
  });

  it('parses unknown or malformed values safely', () => {
    const profile = parseProfile({ displayName: 42, dateOfBirth: 'yesterday', onboardingCompleted: 'yes' });
    expect(profile.displayName).toBe('');
    expect(profile.dateOfBirth).toBeNull();
    expect(profile.onboardingCompleted).toBe(false);
  });

  it('diffs only changed, normalised fields', () => {
    const current = { ...EMPTY_PROFILE_FIELDS, displayName: 'Sam', profession: 'Student' };
    expect(diffProfileFields(current, { ...current, displayName: ' Sam ' })).toEqual({});
    expect(diffProfileFields(current, { ...current, profession: 'Engineer ' })).toEqual({ profession: 'Engineer' });
  });

  it('isProfileComplete reflects the required fields', () => {
    const complete = {
      ...EMPTY_PROFILE_FIELDS,
      displayName: 'Sam',
      dateOfBirth: '2000-01-02',
      profession: 'Student',
      goalsSummary: 'Uni',
    };
    expect(isProfileComplete(complete)).toBe(true);
    expect(isProfileComplete({ ...complete, goalsSummary: ' ' })).toBe(false);
  });
});

describe('resolveDraft', () => {
  it('validates only the requested step and returns stored values', () => {
    const draft = draftFromProfile({ ...EMPTY_PROFILE_FIELDS, displayName: ' Sam ' });
    draft.dob = { day: '2', month: '1', year: '2000' };
    draft.profession = 'Student';
    const { fields, errors } = resolveDraft(draft, ['displayName', 'dateOfBirth', 'profession'], NOW);
    expect(errors).toEqual({});
    expect(fields).toEqual({ displayName: 'Sam', dateOfBirth: '2000-01-02', profession: 'Student' });
  });

  it('reports a bad date of birth', () => {
    const draft = draftFromProfile(EMPTY_PROFILE_FIELDS);
    const { errors } = resolveDraft(draft, ['dateOfBirth'], NOW);
    expect(errors.dateOfBirth).toBeDefined();
  });
});
