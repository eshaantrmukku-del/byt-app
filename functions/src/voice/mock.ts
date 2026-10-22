import { VoiceError, type SpeechAudio, type Transcript, type VoiceProvider } from './types.js';

/** What a real recording "says" in playable mode; the mock can't hear it. */
export const MOCK_SPOKEN_TRANSCRIPT = 'This is a voice test from my phone.';

const SAMPLE_RATE = 16_000;

/** A quiet 220 Hz tone, about as long as the reply would take to say, as 16-bit mono WAV. */
function toneWav(text: string): Buffer {
  const seconds = Math.min(8, Math.max(0.6, text.length * 0.06));
  const samples = Math.round(seconds * SAMPLE_RATE);
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + samples * 2, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(SAMPLE_RATE, 24);
  wav.writeUInt32LE(SAMPLE_RATE * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(samples * 2, 40);
  const fade = SAMPLE_RATE * 0.05;
  for (let i = 0; i < samples; i++) {
    const envelope = Math.min(1, i / fade, (samples - i) / fade);
    wav.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE) * 3000 * envelope), 44 + i * 2);
  }
  return wav;
}

/**
 * Offline stand-in: the "audio" is UTF-8 text, so tests can say what was spoken.
 * `playable` is for trying the app on a phone against the emulator: real recordings get a
 * fixed transcript and replies are real WAV audio.
 */
export class MockVoice implements VoiceProvider {
  readonly name = 'mock';
  constructor(private readonly opts: { failStt?: boolean; failTts?: boolean; playable?: boolean } = {}) {}

  /** Token counts are rough stand-ins (about 32 audio tokens a second, 25 for speech out). */
  async transcribe(audio: Buffer): Promise<Transcript> {
    if (this.opts.failStt) throw new VoiceError('mock stt failure', 'stt');
    const raw = audio.toString('utf8');
    const text = raw.replace(/[^\x20-\x7E]/g, '').trim();
    if (this.opts.playable && text.length < raw.length * 0.9) return { text: MOCK_SPOKEN_TRANSCRIPT, tokens: 200 };
    return { text: text.startsWith('SILENCE') ? '' : text, tokens: 200 };
  }

  async synthesize(text: string): Promise<SpeechAudio> {
    if (this.opts.failTts) throw new VoiceError('mock tts failure', 'tts');
    const data = this.opts.playable ? toneWav(text) : Buffer.from(`MOCK-WAV:${text}`);
    return { data, mimeType: 'audio/wav', tokens: Math.ceil(text.length / 2) };
  }
}
