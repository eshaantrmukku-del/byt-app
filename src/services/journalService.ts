import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

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
