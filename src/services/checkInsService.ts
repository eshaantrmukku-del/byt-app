import { deleteField, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

import type { RatingKey } from '@/features/checkIns/checkIns';
import type { IsoDate } from '@/types/models';

import { userCollection } from './userDataService';
import { trackWrite, type WriteOutcome } from './writes';

export type CheckInValues = Record<RatingKey, number> & { note: string };

/**
 * One check-in per day: the document id is the date. `exists` says whether
 * today's check-in is already in the cloud, so the original createdAt is kept.
 */
export function saveCheckIn(uid: string, date: IsoDate, values: CheckInValues, exists: boolean): Promise<WriteOutcome> {
  const ref = doc(userCollection(uid, 'checkIns'), date);
  const note = values.note.trim();
  const ratings = { mood: values.mood, energy: values.energy, stress: values.stress, sleep: values.sleep };
  if (exists) {
    return trackWrite(updateDoc(ref, { ...ratings, note: note || deleteField(), updatedAt: serverTimestamp() }));
  }
  return trackWrite(
    setDoc(ref, {
      date,
      ...ratings,
      ...(note ? { note } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );
}
