import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  initializeAuth,
  type Auth,
  type Persistence,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { Platform } from 'react-native';

import { env } from '@/config/env';

/** Region of the coachTurn / voiceTurn callables (see internal/coach-api-contract.md). */
export const FUNCTIONS_REGION = 'europe-west2';

export type FirebaseServices = { app: FirebaseApp; auth: Auth; db: Firestore; functions: Functions };

function createNativeAuth(app: FirebaseApp): Auth {
  // getReactNativePersistence only exists in the React Native build of firebase/auth,
  // which the public type definitions don't describe.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getReactNativePersistence } = require('@firebase/auth') as {
    getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
  };
  try {
    return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    // Already initialised (fast refresh).
    return getAuth(app);
  }
}

function init(): FirebaseServices | null {
  if (!env.ok) {
    console.warn(`[BYT] Firebase is not configured: ${env.problems.join('; ')}`);
    return null;
  }
  const isFirstInit = getApps().length === 0;
  const app = isFirstInit ? initializeApp(env.firebase) : getApp();
  const auth = Platform.OS === 'web' ? getAuth(app) : createNativeAuth(app);
  const db = getFirestore(app);
  const functions = getFunctions(app, FUNCTIONS_REGION);

  if (env.emulator && isFirstInit) {
    connectAuthEmulator(auth, `http://${env.emulator.host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, env.emulator.host, 8080);
    connectFunctionsEmulator(functions, env.emulator.host, 5001);
  }
  return { app, auth, db, functions };
}

export const firebase = init();

export function requireFirebase(): FirebaseServices {
  if (!firebase) throw new Error('Firebase is not configured.');
  return firebase;
}
