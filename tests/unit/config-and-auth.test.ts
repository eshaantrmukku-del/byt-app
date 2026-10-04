import { describe, expect, it } from 'vitest';

import { parseEnv } from '@/config/env';
import { friendlyError, validateEmail, validateNewPassword } from '@/features/auth/authErrors';

const validEnv = {
  EXPO_PUBLIC_FIREBASE_API_KEY: 'test-key',
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'demo.firebaseapp.com',
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'demo-byt',
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: 'demo-byt.appspot.com',
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '1234',
  EXPO_PUBLIC_FIREBASE_APP_ID: '1:1234:web:abcdef',
};

describe('parseEnv', () => {
  it('accepts a complete config', () => {
    const env = parseEnv(validEnv);
    expect(env.ok).toBe(true);
    if (env.ok) {
      expect(env.firebase.projectId).toBe('demo-byt');
      expect(env.emulator).toBeNull();
    }
  });

  it('lists missing and malformed keys without echoing values', () => {
    const env = parseEnv({ ...validEnv, EXPO_PUBLIC_FIREBASE_API_KEY: '', EXPO_PUBLIC_FIREBASE_APP_ID: 'secret-ish' });
    expect(env.ok).toBe(false);
    if (!env.ok) {
      expect(env.problems).toEqual([
        'EXPO_PUBLIC_FIREBASE_API_KEY is missing',
        'EXPO_PUBLIC_FIREBASE_APP_ID has an unexpected format',
      ]);
      expect(env.problems.join(' ')).not.toContain('secret-ish');
    }
  });

  it('enables emulators only when asked', () => {
    const env = parseEnv({ ...validEnv, EXPO_PUBLIC_USE_FIREBASE_EMULATORS: '1', EXPO_PUBLIC_FIREBASE_EMULATOR_HOST: '10.0.0.2' });
    expect(env.ok && env.emulator).toEqual({ host: '10.0.0.2' });
  });
});

describe('auth helpers', () => {
  it('maps Firebase codes to friendly messages and hides raw errors', () => {
    expect(friendlyError({ code: 'auth/invalid-credential' })).toBe('Email or password is incorrect.');
    expect(friendlyError({ code: 'permission-denied' })).toMatch(/couldn’t be accessed/);
    expect(friendlyError(new Error('internal stack detail'))).toBe('Something went wrong. Please try again.');
  });

  it('validates email and password', () => {
    expect(validateEmail('sam@example.com')).toBeNull();
    expect(validateEmail('sam@')).not.toBeNull();
    expect(validateNewPassword('short')).not.toBeNull();
    expect(validateNewPassword('long-enough')).toBeNull();
  });
});
