import { describe, expect, it } from 'vitest';

import { chunks, joinWavs } from '../../src/voice/groq.js';

/** A minimal 16-bit mono WAV holding the given samples. */
function wav(samples: number[]): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(s, i * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24_000, 24);
  header.writeUInt32LE(48_000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

describe('Groq voice helpers', () => {
  it('splits a reply at sentence ends, under the limit', () => {
    const text = 'That fear is doing a lot of the steering. If a no said nothing about you, what would you do tonight? Take your time.';
    const parts = chunks(text, 60);
    expect(parts).toEqual(['That fear is doing a lot of the steering.', 'If a no said nothing about you, what would you do tonight?', 'Take your time.']);
    expect(chunks('Short one.', 200)).toEqual(['Short one.']);
    expect(chunks('word '.repeat(60), 50).every((p) => p.length <= 50)).toBe(true);
  });

  it('joins WAV pieces into one playable file', () => {
    const joined = joinWavs([wav([1, 2]), wav([3, 4, 5])]);
    expect(joined.toString('latin1', 0, 4)).toBe('RIFF');
    expect(joined.readUInt32LE(40)).toBe(10);
    expect([0, 1, 2, 3, 4].map((i) => joined.readInt16LE(44 + i * 2))).toEqual([1, 2, 3, 4, 5]);
    expect(joined.readUInt32LE(4)).toBe(joined.length - 8);
  });
});
