import type { JournalEntry } from '@/types/models';

/** Must match firestore.rules. */
export const JOURNAL_TEXT_LIMIT = 20_000;

/** Text ready to store, or null when there's nothing to save (blank saves are a no-op). */
export function prepareJournalText(text: string): string | null {
  const value = text.replace(/\r\n/g, '\n').trim();
  if (!value) return null;
  return value.slice(0, JOURNAL_TEXT_LIMIT);
}

export function sortJournal(entries: readonly JournalEntry[]): JournalEntry[] {
  return [...entries].sort((a, b) => b.createdAt - a.createdAt);
}
