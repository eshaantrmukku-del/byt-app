import { TIMEOUTS, VOICE } from '../config.js';
import { VoiceError, type VoiceProvider } from './types.js';

const BASE = 'https://api.deepgram.com/v1';

/**
 * Deepgram Nova-3 for pre-recorded speech-to-text and Aura-2 for text-to-speech.
 * (Flux is streaming-only; the app sends a finished recording, so Nova-3 is the right model.)
 */
export class DeepgramVoice implements VoiceProvider {
  readonly name = 'deepgram';

  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new VoiceError('DEEPGRAM_API_KEY is not set', 'stt');
  }

  async transcribe(audio: Buffer, mimeType: string): Promise<string> {
    const params = new URLSearchParams({
      model: VOICE.sttModel,
      smart_format: 'true',
      punctuate: 'true',
      language: process.env.BYT_STT_LANGUAGE || 'en',
    });
    const res = await fetch(`${BASE}/listen?${params}`, {
      method: 'POST',
      headers: { Authorization: `Token ${this.apiKey}`, 'Content-Type': mimeType === 'audio/m4a' ? 'audio/mp4' : mimeType },
      body: new Uint8Array(audio),
      signal: AbortSignal.timeout(TIMEOUTS.sttMs),
    }).catch(() => {
      throw new VoiceError('Speech-to-text request failed', 'stt');
    });
    if (!res.ok) throw new VoiceError(`Speech-to-text failed (${res.status})`, 'stt');
    const json = (await res.json()) as {
      results?: { channels?: { alternatives?: { transcript?: string }[] }[] };
    };
    return json.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? '';
  }

  async synthesize(text: string): Promise<Buffer> {
    const params = new URLSearchParams({ model: VOICE.ttsVoice, encoding: 'mp3' });
    const res = await fetch(`${BASE}/speak?${params}`, {
      method: 'POST',
      headers: { Authorization: `Token ${this.apiKey}`, 'Content-Type': 'application/json' },
      // Aura accepts up to 2000 characters per request; voice replies are far shorter.
      body: JSON.stringify({ text: text.slice(0, 2000) }),
      signal: AbortSignal.timeout(TIMEOUTS.ttsMs),
    }).catch(() => {
      throw new VoiceError('Text-to-speech request failed', 'tts');
    });
    if (!res.ok) throw new VoiceError(`Text-to-speech failed (${res.status})`, 'tts');
    return Buffer.from(await res.arrayBuffer());
  }
}

/** Offline stand-in: the "audio" is UTF-8 text, so tests can say what was spoken. */
export class MockVoice implements VoiceProvider {
  readonly name = 'mock';
  constructor(private readonly opts: { failStt?: boolean; failTts?: boolean } = {}) {}

  async transcribe(audio: Buffer): Promise<string> {
    if (this.opts.failStt) throw new VoiceError('mock stt failure', 'stt');
    const text = audio.toString('utf8').replace(/[^\x20-\x7E]/g, '').trim();
    return text.startsWith('SILENCE') ? '' : text;
  }

  async synthesize(text: string): Promise<Buffer> {
    if (this.opts.failTts) throw new VoiceError('mock tts failure', 'tts');
    return Buffer.from(`MOCK-MP3:${text.slice(0, 32)}`);
  }
}
