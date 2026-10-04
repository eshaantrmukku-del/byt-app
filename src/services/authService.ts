import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';

import { requireFirebase } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';

import { clearUserState, rememberSignUpName, stopUserWatches } from './session';
import { flushPendingWrites } from './writes';

/**
 * Creates the Firebase account. The session listener then creates the profile
 * document (create-if-absent), which is what initialises the user's data.
 */
export async function signUp(displayName: string, email: string, password: string): Promise<void> {
  const { auth } = requireFirebase();
  const name = displayName.trim();
  rememberSignUpName(email, name);
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  // Best effort: the Firestore profile is the source of truth for the name.
  await updateProfile(credential.user, { displayName: name }).catch(() => undefined);
}

export async function logIn(email: string, password: string): Promise<void> {
  const { auth } = requireFirebase();
  await signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { auth } = requireFirebase();
  await sendPasswordResetEmail(auth, email.trim());
}

export type LogOutResult = 'signedOut' | 'unsynced';

/**
 * Waits for queued writes to reach the server before signing out. If they don't
 * finish in time, returns 'unsynced' so the UI can ask before discarding them.
 */
export async function logOut(options: { force?: boolean } = {}): Promise<LogOutResult> {
  const { auth } = requireFirebase();
  const flushed = await flushPendingWrites();
  if (!flushed && !options.force) return 'unsynced';

  useAuthStore.getState().setSigningOut(true);
  try {
    stopUserWatches();
    await signOut(auth);
    clearUserState();
  } finally {
    useAuthStore.getState().setSigningOut(false);
  }
  return 'signedOut';
}
