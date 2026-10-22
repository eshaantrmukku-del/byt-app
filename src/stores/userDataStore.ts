import { create } from 'zustand';

import type { CheckIn, Conversation, Goal, JournalEntry } from '@/types/models';

/**
 * - loading: waiting for the first answer from the server
 * - ready: items reflect Firestore (including this device's pending writes)
 * - unavailable: the listener failed; `error` explains, items keep their last value
 */
export type CollectionStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

export type CollectionOrigin = 'none' | 'legacy' | 'server';

export type CollectionState<T> = {
  status: CollectionStatus;
  /** What screens show: server rows, plus prototype rows the server has not got yet. */
  items: T[];
  error: string | null;
  /** 'server' once a subcollection snapshot arrived; 'legacy' while only users/{uid} rows exist. */
  origin: CollectionOrigin;
  /** Rows read from the prototype user document. */
  legacy: T[];
  /** Rows from the subcollection; null until the server has answered. */
  server: T[] | null;
};

export type CollectionKey = 'goals' | 'checkIns' | 'journal' | 'conversations';

type Items = { goals: Goal; checkIns: CheckIn; journal: JournalEntry; conversations: Conversation };

type UserDataState = { uid: string | null; legacyImported: boolean } & { [K in CollectionKey]: CollectionState<Items[K]> } & {
  begin: (uid: string) => void;
  setItems: <K extends CollectionKey>(uid: string, key: K, items: Items[K][], origin?: Exclude<CollectionOrigin, 'none'>) => void;
  /** The backend has copied the prototype rows into the subcollections; show those alone. */
  setLegacyImported: (uid: string) => void;
  /** The collection was answered (or rules denied it). Keep any rows already loaded. */
  markReachable: (uid: string, key: CollectionKey) => void;
  setUnavailable: (uid: string, key: CollectionKey, error: string) => void;
  reset: () => void;
};

const KEYS: CollectionKey[] = ['goals', 'checkIns', 'journal', 'conversations'];

const empty = <T>(status: CollectionStatus): CollectionState<T> => ({
  status,
  items: [],
  error: null,
  origin: 'none',
  legacy: [],
  server: null,
});

const initial = (uid: string | null, status: CollectionStatus) => ({
  uid,
  legacyImported: false,
  goals: empty<Goal>(status),
  checkIns: empty<CheckIn>(status),
  journal: empty<JournalEntry>(status),
  conversations: empty<Conversation>(status),
});

/**
 * Until the backend import has run, server rows and prototype rows are shown
 * together (server wins on the same id), so a first new goal can't hide the old
 * ones. Afterwards the server holds everything, and a row deleted there must
 * stay deleted, so only the server rows are shown.
 */
export function composeItems<T extends { id: string }>(legacy: T[], server: T[] | null, imported: boolean): T[] {
  if (server === null) return legacy;
  if (imported || legacy.length === 0) return server;
  const ids = new Set(server.map((item) => item.id));
  return [...server, ...legacy.filter((item) => !ids.has(item.id))];
}

function withItems<T extends { id: string }>(state: CollectionState<T>, imported: boolean): CollectionState<T> {
  return {
    ...state,
    items: composeItems(state.legacy, state.server, imported),
    origin: state.server !== null ? 'server' : state.legacy.length > 0 ? 'legacy' : 'none',
  };
}

export const useUserDataStore = create<UserDataState>()((set, get) => ({
  ...initial(null, 'idle'),
  begin: (uid) => {
    const current = get();
    if (current.uid !== uid) {
      set(initial(uid, 'loading'));
      return;
    }
    // A retry must not throw away rows already read from the user document.
    const keep = <K extends CollectionKey>(key: K) =>
      withItems({ ...empty<Items[K]>('loading'), legacy: current[key].legacy as Items[K][] }, current.legacyImported);
    set({ goals: keep('goals'), checkIns: keep('checkIns'), journal: keep('journal'), conversations: keep('conversations') });
  },
  setItems: (uid, key, items, origin = 'server') => {
    const state = get();
    if (state.uid !== uid) return;
    const current = state[key] as CollectionState<Items[typeof key]>;
    const next = origin === 'legacy' ? { ...current, legacy: items } : { ...current, server: items };
    // Legacy rows alone don't settle a collection that is still waiting on the server.
    const status = origin === 'server' || current.status !== 'loading' || items.length > 0 ? 'ready' : current.status;
    const error = origin === 'server' || items.length > 0 ? null : current.error;
    set({ [key]: withItems({ ...next, status, error }, state.legacyImported) } as Partial<UserDataState>);
  },
  setLegacyImported: (uid) => {
    const state = get();
    if (state.uid !== uid || state.legacyImported) return;
    const next: Partial<UserDataState> = { legacyImported: true };
    for (const key of KEYS) (next as Record<string, unknown>)[key] = withItems(state[key] as CollectionState<{ id: string }>, true);
    set(next);
  },
  markReachable: (uid, key) => {
    const state = get();
    if (state.uid !== uid) return;
    const current = state[key];
    set({ [key]: { ...current, status: 'ready', error: null } } as Partial<UserDataState>);
  },
  setUnavailable: (uid, key, error) => {
    const state = get();
    if (state.uid !== uid) return;
    set({ [key]: { ...state[key], status: 'unavailable', error } } as Partial<UserDataState>);
  },
  reset: () => set(initial(null, 'idle')),
}));
