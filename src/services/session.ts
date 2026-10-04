import { onAuthStateChanged, type User } from 'firebase/auth';
import { onSnapshot } from 'firebase/firestore';

import { friendlyError } from '@/features/auth/authErrors';
import { decideProfileSnapshot } from '@/features/profile/hydration';
import type { Identity } from '@/features/profile/profileDoc';
import { firebase } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';
import { useProfileStore } from '@/stores/profileStore';
import { useChatStore } from '@/stores/chatStore';
import { useCreditsStore } from '@/stores/creditsStore';
import { useSyncStore } from '@/stores/syncStore';
import { useUserDataStore } from '@/stores/userDataStore';

import { createProfileIfAbsent, profileRef, upgradeLegacyProfile } from './profileService';
import { watchUserData } from './userDataService';

const PROFILE_TIMEOUT_MS = 15_000;
const OFFLINE_MESSAGE = 'Can’t reach BYT right now. Check your connection and try again.';

/** Names typed at sign-up, used when the profile document is first created. */
const pendingNames = new Map<string, string>();

export function rememberSignUpName(email: string, displayName: string) {
  pendingNames.set(email.trim().toLowerCase(), displayName.trim());
}

function identityFor(user: User): Identity {
  const email = user.email ?? '';
  const typed = pendingNames.get(email.toLowerCase());
  return { email, displayName: typed || user.displayName || email.split('@')[0] || 'Friend' };
}

let stopProfile: (() => void) | null = null;

function watchProfile(user: User) {
  stopProfile?.();
  const uid = user.uid;
  const profile = useProfileStore.getState();
  profile.begin(uid);

  let working = false;
  const runOnce = (task: () => Promise<void>) => {
    if (working) return;
    working = true;
    task()
      .catch((error: unknown) => useProfileStore.getState().setUnavailable(uid, friendlyError(error)))
      .finally(() => {
        working = false;
      });
  };

  const timer = setTimeout(() => {
    if (useProfileStore.getState().status === 'loading') {
      useProfileStore.getState().setUnavailable(uid, OFFLINE_MESSAGE);
    }
  }, PROFILE_TIMEOUT_MS);

  const unsubscribe = onSnapshot(
    profileRef(uid),
    (snap) => {
      const decision = decideProfileSnapshot({
        exists: snap.exists(),
        fromCache: snap.metadata.fromCache,
        data: snap.data(),
      });
      switch (decision.kind) {
        case 'ready':
          useProfileStore.getState().setReady(uid, decision.profile);
          break;
        case 'create':
          runOnce(() => createProfileIfAbsent(uid, identityFor(user)));
          break;
        case 'upgrade':
          runOnce(() => upgradeLegacyProfile(uid, identityFor(user)));
          break;
        case 'wait':
          break;
      }
    },
    (error) => {
      if (useAuthStore.getState().signingOut) return;
      useProfileStore.getState().setUnavailable(uid, friendlyError(error, OFFLINE_MESSAGE));
    }
  );

  stopProfile = () => {
    clearTimeout(timer);
    unsubscribe();
    stopProfile = null;
  };
}

let stopData: (() => void) | null = null;

/** Re-subscribes to goals, check-ins and journal after a listener error. */
export function retryUserData() {
  const user = firebase?.auth.currentUser;
  if (!user) return;
  stopData?.();
  stopData = watchUserData(user.uid);
}

/** Stops every Firestore listener for the signed-in user. */
export function stopUserWatches() {
  stopProfile?.();
  stopData?.();
  stopData = null;
}

/** Clears all user-scoped state so nothing carries over to the next account. */
export function clearUserState() {
  useProfileStore.getState().reset();
  useUserDataStore.getState().reset();
  useCreditsStore.getState().reset();
  useChatStore.getState().reset();
  useSyncStore.getState().reset();
}

/** Re-subscribes to the profile after an error (the old listener is dead by then). */
export function retryProfile() {
  const user = firebase?.auth.currentUser;
  if (user) watchProfile(user);
}

/** Wires Firebase Auth to the stores. Call once from the root layout. */
export function startSession(): () => void {
  if (!firebase) {
    useAuthStore.getState().setUser(null);
    return () => {};
  }
  const unsubscribeAuth = onAuthStateChanged(firebase.auth, (user) => {
    stopUserWatches();
    if (!user) {
      clearUserState();
      useAuthStore.getState().setUser(null);
      return;
    }
    useAuthStore.getState().setUser({ uid: user.uid, email: user.email ?? '', displayName: user.displayName });
    watchProfile(user);
    stopData = watchUserData(user.uid);
  });
  return () => {
    unsubscribeAuth();
    stopUserWatches();
  };
}
