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

import { friendlyError, isPermissionDenied } from '@/features/auth/authErrors';
import { parseCheckIn, parseConversation, parseGoal, parseJournalEntry } from '@/features/parse';
import { parseAccountDoc } from '@/features/usage/usage';
import { legacyChats, legacyCheckIns, legacyGoals, legacyJournal } from '@/features/profile/legacyAccount';
import { requireFirebase } from '@/lib/firebase';
import { useAuthStore } from '@/stores/authStore';
import { coachClient } from '@/services/coach/coachClient';
import { useChatStore } from '@/stores/chatStore';
import { useUsageStore } from '@/stores/usageStore';
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

/**
 * Shows goals, check-ins, journal and chats that the prototype saved
 * on the user document itself. They stay visible next to any subcollection rows
 * until getAccount has copied them across (see functions/src/legacy).
 */
export function applyLegacyAccount(uid: string, data: DocumentData | undefined): void {
  if (!data) return;
  const store = useUserDataStore.getState();
  store.setItems(uid, 'goals', legacyGoals(data), 'legacy');
  store.setItems(uid, 'checkIns', legacyCheckIns(data), 'legacy');
  store.setItems(uid, 'journal', legacyJournal(data), 'legacy');
  const chats = legacyChats(data);
  store.setItems(uid, 'conversations', chats.map((chat) => chat.conversation), 'legacy');
  for (const chat of chats) {
    const existing = useChatStore.getState().messages[chat.conversation.id];
    if (existing?.status === 'ready' && existing.items.length > 0) continue;
    useChatStore.getState().setMessages(chat.conversation.id, { status: 'ready', items: chat.messages, error: null });
  }
}

/** Subscribes to the user's goals, check-ins, journal and credits. Returns an unsubscribe. */
export function watchUserData(uid: string): () => void {
  const store = useUserDataStore.getState();
  store.begin(uid);

  const onError = (key: CollectionKey) => (error: unknown) => {
    if (useAuthStore.getState().signingOut) return;
    // Rules that have not been deployed deny subcollections. The user document
    // still holds the account, so this is not "can't reach BYT".
    if (isPermissionDenied(error)) {
      useUserDataStore.getState().markReachable(uid, key);
      return;
    }
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
      if (confirmed) return;
      const current = useUserDataStore.getState()[key];
      if (current.origin === 'legacy' || current.items.length > 0) {
        useUserDataStore.getState().markReachable(uid, key);
        return;
      }
      useUserDataStore.getState().setUnavailable(uid, key, OFFLINE_MESSAGE);
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
        if (snap.data()?.legacyImport) useUserDataStore.getState().setLegacyImported(uid);
        // A missing doc is normal until getAccount creates it.
        const parsed = parseAccountDoc(snap.data());
        if (parsed) useUsageStore.getState().setAccount(parsed);
      },
      // Rules that aren't deployed yet deny private/account; the default allowance shows.
      () => undefined
    ),
  ];

  // Creates the account doc lazily and copies a prototype account into the
  // subcollections once. Nothing waits on it: it may not be deployed yet.
  void coachClient.getAccount().then((account) => {
    if (account.legacyImported) useUserDataStore.getState().setLegacyImported(uid);
    useUsageStore.getState().setAccount({ plan: account.plan, ...account.usage });
  }).catch(() => undefined);

  return () => stops.forEach((stop) => stop());
}
