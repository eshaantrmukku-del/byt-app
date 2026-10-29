import { execFile } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { logger } from 'firebase-functions';

import { TIMEOUTS } from '../config.js';
import { VoiceError, type SpeechAudio, type Transcript, type VoiceProvider } from './types.js';

const BASE = 'https://api.groq.com/openai/v1/audio';
const STT_MODEL = process.env.BYT_GROQ_STT_MODEL || 'whisper-large-v3-turbo';
const TTS_MODEL = process.env.BYT_GROQ_TTS_MODEL || 'canopylabs/orpheus-v1-english';
const TTS_VOICE = process.env.BYT_GROQ_VOICE || 'troy';
/** Orpheus reads short inputs; longer replies are spoken a sentence group at a time. */
const TTS_CHUNK_CHARS = 200;

const EXTENSIONS: Record<string, string> = { 'audio/m4a': 'm4a', 'audio/mp4': 'm4a', 'audio/aac': 'm4a', 'audio/wav': 'wav', 'audio/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg' };

/**
 * Voice through Groq, for trying the app on a phone against the emulator: Whisper hears
 * the recording and Orpheus speaks the reply. If Orpheus can't be used (its terms must be
 * accepted once in the Groq console), replies are spoken with the Mac's own voice instead.
 */
export class GroqVoice implements VoiceProvider {
  readonly name = 'groq';
  private orpheusOff = false;

  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new VoiceError('GROQ_API_KEY is not set', 'stt');
  }

  async transcribe(audio: Buffer, mimeType: string): Promise<Transcript> {
    const form = new FormData();
    form.append('model', STT_MODEL);
    form.append('language', 'en');
    form.append('response_format', 'verbose_json');
    form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), `speech.${EXTENSIONS[mimeType] ?? 'm4a'}`);
    const res = await fetch(`${BASE}/transcriptions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUTS.sttMs),
    }).catch(() => null);
    if (!res?.ok) throw new VoiceError(`Speech-to-text request failed (${res?.status ?? 'network'})`, 'stt');
    const data = (await res.json()) as { text?: string; duration?: number };
    // Roughly the audio tokens a second Gemini would bill, so the allowance behaves the same.
    return { text: (data.text ?? '').trim(), tokens: Math.ceil((data.duration ?? 5) * 32) };
  }

  async synthesize(text: string): Promise<SpeechAudio> {
    const tokens = Math.ceil(text.length / 2);
    if (!this.orpheusOff) {
      try {
        const parts: Buffer[] = [];
        for (const chunk of chunks(text)) parts.push(await this.orpheus(chunk));
        return { data: joinWavs(parts), mimeType: 'audio/wav', tokens };
      } catch (error) {
        if (process.platform !== 'darwin') throw error;
        if (error instanceof TermsRequired) {
          this.orpheusOff = true;
          logger.warn('groq_tts_terms_required', { hint: 'Accept the Orpheus terms in the Groq console; using the Mac voice meanwhile.' });
        }
      }
    }
    return { data: await macSpeech(text), mimeType: 'audio/wav', tokens };
  }

  private async orpheus(input: string): Promise<Buffer> {
    const res = await fetch(`${BASE}/speech`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: TTS_MODEL, voice: TTS_VOICE, input, response_format: 'wav' }),
      signal: AbortSignal.timeout(TIMEOUTS.ttsMs),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (body.includes('model_terms_required')) throw new TermsRequired();
      throw new VoiceError(`Text-to-speech request failed (${res.status})`, 'tts');
    }
    return Buffer.from(await res.arrayBuffer());
  }
}

class TermsRequired extends VoiceError {
  constructor() {
    super('Orpheus terms not accepted', 'tts');
  }
}

/** Splits at sentence ends so each piece stays under the TTS input limit. */
export function chunks(text: string, max = TTS_CHUNK_CHARS): string[] {
  const sentences = text.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  const out: string[] = [];
  let current = '';
  for (const s of sentences) {
    if (current && (current + s).length > max) {
      out.push(current.trim());
      current = '';
    }
    // A single sentence longer than the limit is cut at word boundaries.
    let rest = s;
    while (rest.length > max) {
      const cut = rest.lastIndexOf(' ', max) > 0 ? rest.lastIndexOf(' ', max) : max;
      out.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut);
    }
    current += rest;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** Concatenates WAV files that share one format into a single WAV. */
export function joinWavs(files: Buffer[]): Buffer {
  if (files.length === 1) return files[0]!;
  let fmt: Buffer | null = null;
  const pcm: Buffer[] = [];
  for (const file of files) {
    let offset = 12;
    while (offset + 8 <= file.length) {
      const id = file.toString('latin1', offset, offset + 4);
      const size = file.readUInt32LE(offset + 4);
      if (id === 'fmt ') fmt ??= file.subarray(offset + 8, offset + 8 + size);
      if (id === 'data') {
        // Streamed WAVs may leave the size unset; take the rest of the file.
        pcm.push(file.subarray(offset + 8, Math.min(file.length, offset + 8 + size)));
        break;
      }
      offset += 8 + size + (size % 2);
    }
  }
  if (!fmt) throw new VoiceError('Text-to-speech returned unreadable audio', 'tts');
  const data = Buffer.concat(pcm);
  const header = Buffer.alloc(20 + fmt.length + 8);
  header.write('RIFF', 0);
  header.writeUInt32LE(header.length - 8 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(fmt.length, 16);
  fmt.copy(header, 20);
  header.write('data', 20 + fmt.length);
  header.writeUInt32LE(data.length, 24 + fmt.length);
  return Buffer.concat([header, data]);
}

const run = promisify(execFile);

/** The Mac's built-in British voice, as 16-bit mono WAV. Development only. */
async function macSpeech(text: string): Promise<Buffer> {
  const file = join(tmpdir(), `byt-say-${process.pid}-${Date.now()}.wav`);
  try {
    await run('say', ['-v', process.env.BYT_MAC_VOICE || 'Daniel', '-o', file, '--file-format=WAVE', '--data-format=LEI16@22050', text], { timeout: TIMEOUTS.ttsMs });
    return await readFile(file);
  } catch {
    throw new VoiceError('Text-to-speech failed', 'tts');
  } finally {
    await rm(file, { force: true });
  }
}
