import type { UserProfile } from '@/types/models';

import { isCurrentSchema, parseProfile } from './profileDoc';

export type ProfileSnapshotInput = {
  exists: boolean;
  /** True when Firestore answered from its local cache rather than the server. */
  fromCache: boolean;
  data: Record<string, unknown> | undefined;
};

export type ProfileSnapshotDecision =
  | { kind: 'ready'; profile: UserProfile }
  /** Prototype-era document: add schema-v2 fields, never replace existing ones. */
  | { kind: 'upgrade' }
  /** The server confirmed there is no profile: create one if it is still absent. */
  | { kind: 'create' }
  /** Absence not confirmed by the server (offline / cache): do nothing and keep waiting. */
  | { kind: 'wait' };

/**
 * Cloud-first hydration. The cloud profile is the only source of truth; local
 * state is never written back. A missing document only leads to a write when the
 * server itself reports it missing, and that write is create-if-absent.
 */
export function decideProfileSnapshot(snap: ProfileSnapshotInput): ProfileSnapshotDecision {
  if (!snap.exists || !snap.data) {
    return snap.fromCache ? { kind: 'wait' } : { kind: 'create' };
  }
  if (!isCurrentSchema(snap.data)) {
    return snap.fromCache ? { kind: 'wait' } : { kind: 'upgrade' };
  }
  return { kind: 'ready', profile: parseProfile(snap.data) };
}
