import { create } from 'zustand';

import type { Account } from '@/types/models';

/**
 * Read-only mirror of the server-owned users/{uid}/private/account doc.
 * 'unknown' until the backend creates it (or if it can't be read yet).
 */
type CreditsState = {
  status: 'unknown' | 'ready';
  account: Account | null;
  setAccount: (account: Account | null) => void;
  reset: () => void;
};

export const useCreditsStore = create<CreditsState>()((set) => ({
  status: 'unknown',
  account: null,
  setAccount: (account) => set({ account, status: account ? 'ready' : 'unknown' }),
  reset: () => set({ status: 'unknown', account: null }),
}));
