import { deleteField, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

import { REFLECTION_LIMIT, WIN_LIMIT } from '@/features/checkIns/checkIns';
import type { IsoDate, MoodId } from '@/types/models';

import { userCollection } from './userDataService';
import { trackWrite, type WriteOutcome } from './writes';

export type CheckInValues = {
  moods: MoodId[];
  happiness: number;
  stress: number;
  sleep: number;
  reflection: string;
  win: string;
};

/**
 * One check-in per day: the document id is the date. `exists` says whether
 * today's check-in is already in the cloud, so the original createdAt is kept.
 */
export function saveCheckIn(uid: string, date: IsoDate, values: CheckInValues, exists: boolean): Promise<WriteOutcome> {
  const ref = doc(userCollection(uid, 'checkIns'), date);
  const reflection = values.reflection.trim().slice(0, REFLECTION_LIMIT);
  const win = values.win.trim().slice(0, WIN_LIMIT);
  const core = { moods: values.moods, happiness: values.happiness, stress: values.stress, sleep: values.sleep };
  if (exists) {
    return trackWrite(
      updateDoc(ref, {
        ...core,
        reflection: reflection || deleteField(),
        win: win || deleteField(),
        updatedAt: serverTimestamp(),
      })
    );
  }
  return trackWrite(
    setDoc(ref, {
      date,
      ...core,
      ...(reflection ? { reflection } : {}),
      ...(win ? { win } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );
}
