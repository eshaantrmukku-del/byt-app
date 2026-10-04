import { FirebaseApp, getApps, initializeApp, type FirebaseOptions } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import { getAuth, initializeAuth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

function buildFirebaseOptions(): FirebaseOptions | null {
  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
  const storageBucket = process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const messagingSenderId = process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.EXPO_PUBLIC_FIREBASE_APP_ID;
  const measurementId = process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID;

  if (!apiKey || !authDomain || !projectId || !storageBucket || !messagingSenderId || !appId) {
    return null;
  }

  const opts: FirebaseOptions = {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  };
  if (measurementId) {
    opts.measurementId = measurementId;
  }
  return opts;
}

const firebaseOptions = buildFirebaseOptions();
export const isFirebaseConfigured = firebaseOptions !== null;

if (!isFirebaseConfigured) {
  console.warn(
    '[Firebase] Missing EXPO_PUBLIC_FIREBASE_* in .env — app opens, but sign-in and cloud sync are disabled until configured.'
  );
}

function getNativeAuth(app: FirebaseApp): Auth {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getReactNativePersistence } = require('@firebase/auth') as {
    getReactNativePersistence: (storage: typeof AsyncStorage) => object;
  };
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage) as never,
    });
  } catch {
    return getAuth(app);
  }
}

export const app: FirebaseApp | null = firebaseOptions
  ? getApps().length
    ? getApps()[0]!
    : initializeApp(firebaseOptions)
  : null;

export const db: Firestore | null = app ? getFirestore(app) : null;

export const auth: Auth | null = app
  ? Platform.OS === 'web'
    ? getAuth(app)
    : getNativeAuth(app)
  : null;
