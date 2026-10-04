import { waitForPendingWrites } from 'firebase/firestore';

import { friendlyError } from '@/features/auth/authErrors';
import { requireFirebase } from '@/lib/firebase';
import { useSyncStore } from '@/stores/syncStore';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type WriteOutcome = 'synced' | 'pending';

/**
 * Tracks a Firestore write so logout can wait for it.
 * Resolves 'synced' once the server accepts it, or 'pending' if it is still queued
 * after `timeoutMs` (offline); rejects if the server rejects the write.
 */
export async function trackWrite(write: Promise<unknown>, timeoutMs = 10_000): Promise<WriteOutcome> {
  useSyncStore.getState().begin();
  const settled = write.then(
    () => {
      useSyncStore.getState().end(null);
      return 'synced' as const;
    },
    (error: unknown) => {
      useSyncStore.getState().end(friendlyError(error));
      throw error;
    }
  );
  return Promise.race([settled, delay(timeoutMs).then(() => 'pending' as const)]);
}

/** True once every queued write has reached the server; false if that didn't happen in time. */
export async function flushPendingWrites(timeoutMs = 8_000): Promise<boolean> {
  const { db } = requireFirebase();
  const flushed = (async () => {
    await waitForPendingWrites(db);
    while (useSyncStore.getState().inFlight > 0) await delay(100);
    return true;
  })();
  return Promise.race([flushed, delay(timeoutMs).then(() => false)]);
}
