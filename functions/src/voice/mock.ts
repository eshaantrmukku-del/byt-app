import { VoiceError, type SpeechAudio, type Transcript, type VoiceProvider } from './types.js';

/** Offline stand-in: the "audio" is UTF-8 text, so tests can say what was spoken. */
export class MockVoice implements VoiceProvider {
  readonly name = 'mock';
  constructor(private readonly opts: { failStt?: boolean; failTts?: boolean } = {}) {}

  /** Token counts are rough stand-ins (about 32 audio tokens a second, 25 for speech out). */
  async transcribe(audio: Buffer): Promise<Transcript> {
    if (this.opts.failStt) throw new VoiceError('mock stt failure', 'stt');
    const text = audio.toString('utf8').replace(/[^\x20-\x7E]/g, '').trim();
    return { text: text.startsWith('SILENCE') ? '' : text, tokens: 200 };
  }

  async synthesize(text: string): Promise<SpeechAudio> {
    if (this.opts.failTts) throw new VoiceError('mock tts failure', 'tts');
    return { data: Buffer.from(`MOCK-WAV:${text}`), mimeType: 'audio/wav', tokens: Math.ceil(text.length / 2) };
  }
}
