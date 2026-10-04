import { create } from 'zustand';

import type { CheckIn, Conversation, Goal, JournalEntry } from '@/types/models';

/**
 * - loading: waiting for the first answer from the server
 * - ready: items reflect Firestore (including this device's pending writes)
 * - unavailable: the listener failed; `error` explains, items keep their last value
 */
export type CollectionStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

export type CollectionState<T> = { status: CollectionStatus; items: T[]; error: string | null };

export type CollectionKey = 'goals' | 'checkIns' | 'journal' | 'conversations';

type Items = { goals: Goal; checkIns: CheckIn; journal: JournalEntry; conversations: Conversation };

type UserDataState = { uid: string | null } & { [K in CollectionKey]: CollectionState<Items[K]> } & {
  begin: (uid: string) => void;
  setItems: <K extends CollectionKey>(uid: string, key: K, items: Items[K][]) => void;
  setUnavailable: (uid: string, key: CollectionKey, error: string) => void;
  reset: () => void;
};

const empty = <T>(status: CollectionStatus): CollectionState<T> => ({ status, items: [], error: null });

const initial = (uid: string | null, status: CollectionStatus) => ({
  uid,
  goals: empty<Goal>(status),
  checkIns: empty<CheckIn>(status),
  journal: empty<JournalEntry>(status),
  conversations: empty<Conversation>(status),
});

export const useUserDataStore = create<UserDataState>()((set, get) => ({
  ...initial(null, 'idle'),
  begin: (uid) => set(initial(uid, 'loading')),
  setItems: (uid, key, items) => {
    if (get().uid !== uid) return;
    set({ [key]: { status: 'ready', items, error: null } } as Partial<UserDataState>);
  },
  setUnavailable: (uid, key, error) => {
    const state = get();
    if (state.uid !== uid) return;
    set({ [key]: { ...state[key], status: 'unavailable', error } } as Partial<UserDataState>);
  },
  reset: () => set(initial(null, 'idle')),
}));
