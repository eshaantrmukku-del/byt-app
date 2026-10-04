import { describe, expect, it } from 'vitest';

import { decideProfileSnapshot } from '@/features/profile/hydration';
import { deriveGate } from '@/features/session/gate';
import { useProfileStore } from '@/stores/profileStore';
import type { UserProfile } from '@/types/models';

const v2Doc = {
  schemaVersion: 2,
  displayName: 'Sam',
  email: 'sam@example.com',
  dateOfBirth: '2000-01-02',
  profession: 'Student',
  goalsSummary: 'Get into university',
  income: '',
  lifestyle: '',
  struggles: '',
  coachNotes: '',
  onboardingCompleted: true,
};

describe('decideProfileSnapshot (cloud-first hydration)', () => {
  it('never creates a profile when absence comes from the local cache (offline)', () => {
    expect(decideProfileSnapshot({ exists: false, fromCache: true, data: undefined })).toEqual({ kind: 'wait' });
  });

  it('creates only when the server confirms the profile is missing', () => {
    expect(decideProfileSnapshot({ exists: false, fromCache: false, data: undefined })).toEqual({ kind: 'create' });
  });

  it('upgrades a prototype-era document instead of replacing it', () => {
    const legacy = { displayName: 'Sam', coachProfile: { profession: 'Student' }, goals: [] };
    expect(decideProfileSnapshot({ exists: true, fromCache: false, data: legacy })).toEqual({ kind: 'upgrade' });
  });

  it('does not act on a cached legacy document', () => {
    expect(decideProfileSnapshot({ exists: true, fromCache: true, data: { displayName: 'Sam' } })).toEqual({
      kind: 'wait',
    });
  });

  it('reads a schema-v2 profile from cache or server', () => {
    for (const fromCache of [true, false]) {
      const decision = decideProfileSnapshot({ exists: true, fromCache, data: v2Doc });
      expect(decision.kind).toBe('ready');
      if (decision.kind === 'ready') expect(decision.profile.goalsSummary).toBe('Get into university');
    }
  });
});

describe('profileStore', () => {
  const profile = { ...v2Doc } as unknown as UserProfile;

  it('keeps a loaded profile when the listener later errors', () => {
    const store = useProfileStore.getState();
    store.begin('u1');
    store.setReady('u1', profile);
    useProfileStore.getState().setUnavailable('u1', 'offline');
    expect(useProfileStore.getState().status).toBe('ready');
    expect(useProfileStore.getState().profile).toEqual(profile);
  });

  it('ignores snapshots for a previous user', () => {
    useProfileStore.getState().begin('u2');
    useProfileStore.getState().setReady('u1', profile);
    expect(useProfileStore.getState().status).toBe('loading');
    expect(useProfileStore.getState().profile).toBeNull();
  });

  it('starts empty for each user', () => {
    useProfileStore.getState().begin('u1');
    useProfileStore.getState().setReady('u1', profile);
    useProfileStore.getState().begin('u3');
    expect(useProfileStore.getState().profile).toBeNull();
  });
});

describe('deriveGate', () => {
  it('routes by auth and profile state', () => {
    expect(deriveGate('initializing', 'idle', undefined)).toBe('booting');
    expect(deriveGate('signedOut', 'idle', undefined)).toBe('signedOut');
    expect(deriveGate('signedIn', 'idle', undefined)).toBe('loadingProfile');
    expect(deriveGate('signedIn', 'loading', undefined)).toBe('loadingProfile');
    expect(deriveGate('signedIn', 'unavailable', undefined)).toBe('profileUnavailable');
    expect(deriveGate('signedIn', 'ready', false)).toBe('onboarding');
    expect(deriveGate('signedIn', 'ready', true)).toBe('ready');
  });
});
