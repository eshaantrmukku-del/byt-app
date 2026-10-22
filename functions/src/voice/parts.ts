import { MAX_AUDIO_PARTS } from '../validation.js';

/** A first part shorter than this sounds clipped on its own ("Mm."), so it takes the next sentence too. */
const MIN_FIRST_CHARS = 40;
/** Later parts are synthesised while the previous one plays; this keeps each one quick. */
const MAX_PART_CHARS = 280;

function sentences(text: string): string[] {
  const out = text.replace(/\s+/g, ' ').trim().match(/[^.!?…]+(?:[.!?…]+["'”’)\]]*|$)/g) ?? [];
  return out.map((s) => s.trim()).filter(Boolean);
}

/**
 * Splits a finished reply into spoken parts. The first part is the first sentence, so the
 * coach starts talking after one short synthesis; the rest follows in sentence-aligned
 * chunks. Deterministic, so the server can rebuild any part from the stored reply.
 */
export function voiceParts(reply: string): string[] {
  const all = sentences(reply);
  if (all.length === 0) return [];
  let first = all.shift()!;
  while (first.length < MIN_FIRST_CHARS && all.length) first = `${first} ${all.shift()!}`;
  const parts = [first];
  let current = '';
  for (const sentence of all) {
    if (current && current.length + sentence.length + 1 > MAX_PART_CHARS) {
      parts.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) parts.push(current);
  // Never more than the client may ask for: fold any overflow into the last part.
  while (parts.length > MAX_AUDIO_PARTS) {
    const tail = parts.pop()!;
    parts[parts.length - 1] = `${parts[parts.length - 1]} ${tail}`;
  }
  return parts;
}
