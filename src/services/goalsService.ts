import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

import type { GoalDraft } from '@/features/goals/goals';

import { userCollection } from './userDataService';
import { trackWrite, type WriteOutcome } from './writes';

export async function createGoal(uid: string, goal: GoalDraft): Promise<{ id: string; outcome: WriteOutcome }> {
  const ref = doc(userCollection(uid, 'goals'));
  const outcome = await trackWrite(
    setDoc(ref, { ...goal, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  );
  return { id: ref.id, outcome };
}

export function updateGoal(uid: string, id: string, changes: Partial<GoalDraft>): Promise<WriteOutcome> {
  if (Object.keys(changes).length === 0) return Promise.resolve('synced');
  return trackWrite(updateDoc(doc(userCollection(uid, 'goals'), id), { ...changes, updatedAt: serverTimestamp() }));
}

export function deleteGoal(uid: string, id: string): Promise<WriteOutcome> {
  return trackWrite(deleteDoc(doc(userCollection(uid, 'goals'), id)));
}
