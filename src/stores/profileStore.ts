import { create } from 'zustand';

import type { UserProfile } from '@/types/models';

/**
 * - idle: no signed-in user
 * - loading: waiting for the server's copy of the profile
 * - ready: profile came from Firestore (the only way to get here)
 * - unavailable: couldn't load it; the user can retry. Nothing is written in this state.
 */
export type ProfileStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

type ProfileState = {
  uid: string | null;
  status: ProfileStatus;
  profile: UserProfile | null;
  error: string | null;
  begin: (uid: string) => void;
  setReady: (uid: string, profile: UserProfile) => void;
  setUnavailable: (uid: string, error: string) => void;
  reset: () => void;
};

const IDLE = { uid: null, status: 'idle', profile: null, error: null } as const;

export const useProfileStore = create<ProfileState>()((set, get) => ({
  ...IDLE,
  begin: (uid) => set({ uid, status: 'loading', profile: null, error: null }),
  setReady: (uid, profile) => {
    if (get().uid !== uid) return;
    set({ status: 'ready', profile, error: null });
  },
  setUnavailable: (uid, error) => {
    const state = get();
    if (state.uid !== uid) return;
    // A loaded profile stays usable; the listener recovers on its own when the connection returns.
    if (state.status === 'ready') return;
    set({ status: 'unavailable', error });
  },
  reset: () => set(IDLE),
}));
