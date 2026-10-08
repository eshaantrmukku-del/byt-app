import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
  type Query,
  type QuerySnapshot,
} from 'firebase/firestore';

import { friendlyError } from '@/features/auth/authErrors';
import { parseAccount, parseCheckIn, parseConversation, parseGoal, parseJournalEntry } from '@/features/parse';
import { requireFirebase } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';
import { coachClient } from '@/services/coach/coachClient';
import { useCreditsStore } from '@/stores/creditsStore';
import { useUserDataStore, type CollectionKey } from '@/stores/userDataStore';

const LOAD_TIMEOUT_MS = 15_000;
const OFFLINE_MESSAGE = 'Can’t reach BYT right now. Showing what’s on this device.';

// History needed for streaks; older check-ins don't change the current streak.
const CHECK_IN_HISTORY = 400;
const JOURNAL_PAGE = 200;

export function userCollection(uid: string, name: CollectionKey | 'private') {
  return collection(requireFirebase().db, 'users', uid, name);
}

function rows<T>(snap: QuerySnapshot<DocumentData>, parse: (id: string, d: DocumentData) => T | null): T[] {
  return snap.docs
    .map((d) => parse(d.id, d.data({ serverTimestamps: 'estimate' })))
    .filter((x): x is T => x !== null);
}

/** Subscribes to the user's goals, check-ins, journal and credits. Returns an unsubscribe. */
export function watchUserData(uid: string): () => void {
  const store = useUserDataStore.getState();
  store.begin(uid);
  useCreditsStore.getState().reset();

  const onError = (key: CollectionKey) => (error: unknown) => {
    if (useAuthStore.getState().signingOut) return;
    useUserDataStore.getState().setUnavailable(uid, key, friendlyError(error, OFFLINE_MESSAGE));
  };

  // An offline first snapshot comes from the (empty) cache; wait for the server, but not forever.
  const watch = <K extends CollectionKey>(
    key: K,
    q: Query<DocumentData>,
    parse: (id: string, d: DocumentData) => unknown
  ) => {
    let confirmed = false;
    const timer = setTimeout(() => {
      if (!confirmed) useUserDataStore.getState().setUnavailable(uid, key, OFFLINE_MESSAGE);
    }, LOAD_TIMEOUT_MS);
    const unsubscribe = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.metadata.fromCache && !confirmed && snap.empty) return;
        if (!snap.metadata.fromCache) {
          confirmed = true;
          clearTimeout(timer);
        }
        useUserDataStore.getState().setItems(uid, key, rows(snap, parse) as never);
      },
      onError(key)
    );
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  };

  // Queries order only by client-set fields: ordering by a pending serverTimestamp
  // can hide a just-written document until the server confirms it. Screens sort locally.
  const stops = [
    watch('goals', userCollection(uid, 'goals'), parseGoal),
    watch(
      'checkIns',
      query(userCollection(uid, 'checkIns'), orderBy('date', 'desc'), limit(CHECK_IN_HISTORY)),
      parseCheckIn
    ),
    watch(
      'journal',
      query(userCollection(uid, 'journal'), orderBy('date', 'desc'), limit(JOURNAL_PAGE)),
      parseJournalEntry
    ),
    watch('conversations', userCollection(uid, 'conversations'), parseConversation),
    onSnapshot(
      doc(requireFirebase().db, 'users', uid, 'private', 'account'),
      (snap) => {
        const parsed = parseAccount(snap.data());
        // A missing doc is normal until getAccount creates it. Don't wipe a value that call just set.
        if (parsed) useCreditsStore.getState().setAccount(parsed);
      },
      // Credits are optional until the backend exists; a read failure just leaves them unknown.
      () => useCreditsStore.getState().setAccount(null)
    ),
  ];

  // Creates the account doc lazily (150 credits) once the callable is deployed.
  void coachClient.getAccount().then((account) => {
    useCreditsStore.getState().setAccount({
      plan: account.plan,
      creditsRemaining: account.creditsRemaining,
      creditsPeriodKey: account.creditsPeriodKey,
      monthlyAllowance: account.monthlyAllowance,
    });
  }).catch(() => undefined);

  return () => stops.forEach((stop) => stop());
}
