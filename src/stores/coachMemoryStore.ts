import { create } from 'zustand';

import type { CoachCommitment } from '@/features/notifications/plan';

/** Read-only mirror of the commitments in the server-owned users/{uid}/private/coach doc. */
type CoachMemoryState = {
  commitments: CoachCommitment[];
  setCommitments: (commitments: CoachCommitment[]) => void;
  reset: () => void;
};

export const useCoachMemoryStore = create<CoachMemoryState>()((set) => ({
  commitments: [],
  setCommitments: (commitments) => set({ commitments }),
  reset: () => set({ commitments: [] }),
}));
