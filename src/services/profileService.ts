import { doc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';

import { buildLegacyUpgrade, buildNewProfile, isCurrentSchema, type Identity } from '@/features/profile/profileDoc';
import { requireFirebase } from '@/lib/firebase';
import type { ProfileFields } from '@/types/models';

import { trackWrite, type WriteOutcome } from './writes';

export function profileRef(uid: string) {
  return doc(requireFirebase().db, 'users', uid);
}

/** Creates the schema-v2 profile only if no document exists on the server. */
export async function createProfileIfAbsent(uid: string, identity: Identity): Promise<void> {
  const { db } = requireFirebase();
  const ref = profileRef(uid);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) return;
    tx.set(ref, { ...buildNewProfile(identity), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
}

/** Adds schema-v2 profile fields to a prototype-era document. Existing data is never removed. */
export async function upgradeLegacyProfile(uid: string, identity: Identity): Promise<void> {
  const { db } = requireFirebase();
  const ref = profileRef(uid);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    if (!snap.exists() || !data || isCurrentSchema(data)) return;
    tx.update(ref, {
      ...buildLegacyUpgrade(data, identity),
      ...(data.createdAt ? {} : { createdAt: serverTimestamp() }),
      updatedAt: serverTimestamp(),
    });
  });
}

export type ProfileChanges = Partial<ProfileFields> & { onboardingCompleted?: boolean };

/** Writes only the changed fields. Never writes a whole local copy over the cloud profile. */
export function saveProfileChanges(uid: string, changes: ProfileChanges): Promise<WriteOutcome> {
  if (Object.keys(changes).length === 0) return Promise.resolve('synced');
  return trackWrite(updateDoc(profileRef(uid), { ...changes, updatedAt: serverTimestamp() }));
}
