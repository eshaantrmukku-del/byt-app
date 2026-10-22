import { create } from 'zustand';

import type { Account } from '@/types/models';

/**
 * Read-only mirror of the server-owned users/{uid}/private/account doc: today's
 * coaching allowance. 'unknown' until the backend has reported it.
 */
type UsageState = {
  status: 'unknown' | 'ready';
  account: Account | null;
  setAccount: (account: Account | null) => void;
  reset: () => void;
};

export const useUsageStore = create<UsageState>()((set) => ({
  status: 'unknown',
  account: null,
  setAccount: (account) => set({ account, status: account ? 'ready' : 'unknown' }),
  reset: () => set({ status: 'unknown', account: null }),
}));
