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
  items: T[];
  error: string | null;
  /** Where the current items came from. An empty server snapshot must not wipe legacy rows. */
  origin: CollectionOrigin;
};

export type CollectionKey = 'goals' | 'checkIns' | 'journal' | 'conversations';

type Items = { goals: Goal; checkIns: CheckIn; journal: JournalEntry; conversations: Conversation };

type UserDataState = { uid: string | null } & { [K in CollectionKey]: CollectionState<Items[K]> } & {
  begin: (uid: string) => void;
  setItems: <K extends CollectionKey>(uid: string, key: K, items: Items[K][], origin?: Exclude<CollectionOrigin, 'none'>) => void;
  /** The collection was answered (or rules denied it). Keep any rows already loaded. */
  markReachable: (uid: string, key: CollectionKey) => void;
  setUnavailable: (uid: string, key: CollectionKey, error: string) => void;
  reset: () => void;
};

const empty = <T>(status: CollectionStatus): CollectionState<T> => ({ status, items: [], error: null, origin: 'none' });

const initial = (uid: string | null, status: CollectionStatus) => ({
  uid,
  goals: empty<Goal>(status),
  checkIns: empty<CheckIn>(status),
  journal: empty<JournalEntry>(status),
  conversations: empty<Conversation>(status),
});

export const useUserDataStore = create<UserDataState>()((set, get) => ({
  ...initial(null, 'idle'),
  begin: (uid) => {
    const current = get();
    if (current.uid !== uid) {
      set(initial(uid, 'loading'));
      return;
    }
    // A retry must not throw away rows already read from the user document.
    const keep = <T>(key: CollectionKey) =>
      (current[key].origin === 'legacy' ? current[key] : empty<T>('loading')) as CollectionState<T>;
    set({
      uid,
      goals: keep('goals'),
      checkIns: keep('checkIns'),
      journal: keep('journal'),
      conversations: keep('conversations'),
    });
  },
  setItems: (uid, key, items, origin = 'server') => {
    if (get().uid !== uid) return;
    const current = get()[key];
    if (origin === 'legacy') {
      if (current.origin === 'server' || items.length === 0) return;
    } else if (items.length === 0 && current.origin === 'legacy' && current.items.length > 0) {
      set({ [key]: { ...current, status: 'ready', error: null } } as Partial<UserDataState>);
      return;
    }
    set({ [key]: { status: 'ready', items, error: null, origin } } as Partial<UserDataState>);
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
