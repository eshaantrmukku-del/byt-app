export type FirebaseClientConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

export type AppEnv =
  | {
      ok: true;
      firebase: FirebaseClientConfig;
      emulator: { host: string } | null;
    }
  | { ok: false; problems: string[] };

export type RawEnv = Record<string, string | undefined>;

const FIREBASE_KEYS = {
  apiKey: 'EXPO_PUBLIC_FIREBASE_API_KEY',
  authDomain: 'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  projectId: 'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  storageBucket: 'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'EXPO_PUBLIC_FIREBASE_APP_ID',
} as const satisfies Record<keyof FirebaseClientConfig, string>;

const FORMAT_CHECKS: Partial<Record<keyof FirebaseClientConfig, RegExp>> = {
  projectId: /^[a-z0-9-]{4,40}$/,
  messagingSenderId: /^\d+$/,
  appId: /^\d+:\d+:[a-z]+:[0-9a-f]+$/,
};

export function parseEnv(raw: RawEnv): AppEnv {
  const problems: string[] = [];
  const firebase = {} as FirebaseClientConfig;

  for (const [field, name] of Object.entries(FIREBASE_KEYS) as [keyof FirebaseClientConfig, string][]) {
    const value = raw[name]?.trim();
    if (!value) {
      problems.push(`${name} is missing`);
      continue;
    }
    const format = FORMAT_CHECKS[field];
    if (format && !format.test(value)) {
      problems.push(`${name} has an unexpected format`);
      continue;
    }
    firebase[field] = value;
  }

  if (problems.length > 0) return { ok: false, problems };

  const useEmulators = raw.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === '1';
  const emulatorHost = raw.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST?.trim() || '127.0.0.1';
  return { ok: true, firebase, emulator: useEmulators ? { host: emulatorHost } : null };
}

// Expo only inlines EXPO_PUBLIC_* variables that are referenced literally, so
// each one is spelled out. Never reference provider secrets here.
export const env: AppEnv = parseEnv({
  EXPO_PUBLIC_FIREBASE_API_KEY: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  EXPO_PUBLIC_FIREBASE_APP_ID: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  EXPO_PUBLIC_USE_FIREBASE_EMULATORS: process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS,
  EXPO_PUBLIC_FIREBASE_EMULATOR_HOST: process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST,
});
