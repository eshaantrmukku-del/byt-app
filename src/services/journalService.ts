import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

import { localDateKey } from '@/features/dates';
import { prepareJournalText } from '@/features/journal/journal';

import { userCollection } from './userDataService';
import { trackWrite, type WriteOutcome } from './writes';

/** Saves a new entry. Returns null without writing when the text is blank. */
export function addJournalEntry(uid: string, text: string): Promise<WriteOutcome> | null {
  const value = prepareJournalText(text);
  if (!value) return null;
  const ref = doc(userCollection(uid, 'journal'));
  return trackWrite(
    setDoc(ref, { date: localDateKey(), text: value, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  );
}

/** Updates an entry's text. Blank text is a no-op (delete is a separate, explicit action). */
export function updateJournalEntry(uid: string, id: string, text: string): Promise<WriteOutcome> | null {
  const value = prepareJournalText(text);
  if (!value) return null;
  return trackWrite(updateDoc(doc(userCollection(uid, 'journal'), id), { text: value, updatedAt: serverTimestamp() }));
}

export function deleteJournalEntry(uid: string, id: string): Promise<WriteOutcome> {
  return trackWrite(deleteDoc(doc(userCollection(uid, 'journal'), id)));
}
