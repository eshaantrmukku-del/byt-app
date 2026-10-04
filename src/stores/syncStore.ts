import { create } from 'zustand';

type SyncState = {
  /** Writes started by the app that the server hasn't acknowledged or rejected yet. */
  inFlight: number;
  lastError: string | null;
  begin: () => void;
  end: (error: string | null) => void;
  clearError: () => void;
  reset: () => void;
};

export const useSyncStore = create<SyncState>()((set) => ({
  inFlight: 0,
  lastError: null,
  begin: () => set((s) => ({ inFlight: s.inFlight + 1 })),
  end: (error) =>
    set((s) => ({ inFlight: Math.max(0, s.inFlight - 1), lastError: error ?? s.lastError })),
  clearError: () => set({ lastError: null }),
  reset: () => set({ inFlight: 0, lastError: null }),
}));
