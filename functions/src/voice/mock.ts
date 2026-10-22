import { VoiceError, type SpeechAudio, type VoiceProvider } from './types.js';

/** Offline stand-in: the "audio" is UTF-8 text, so tests can say what was spoken. */
export class MockVoice implements VoiceProvider {
  readonly name = 'mock';
  constructor(private readonly opts: { failStt?: boolean; failTts?: boolean } = {}) {}

  async transcribe(audio: Buffer): Promise<string> {
    if (this.opts.failStt) throw new VoiceError('mock stt failure', 'stt');
    const text = audio.toString('utf8').replace(/[^\x20-\x7E]/g, '').trim();
    return text.startsWith('SILENCE') ? '' : text;
  }

  async synthesize(text: string): Promise<SpeechAudio> {
    if (this.opts.failTts) throw new VoiceError('mock tts failure', 'tts');
    return { data: Buffer.from(`MOCK-WAV:${text.slice(0, 32)}`), mimeType: 'audio/wav' };
  }
}
