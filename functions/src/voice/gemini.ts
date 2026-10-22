import { ApiError, GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse } from '@google/genai';

import { TIMEOUTS, VOICE } from '../config.js';
import { VoiceError, type SpeechAudio, type VoiceProvider } from './types.js';

/**
 * Voice on the same Gemini key as the coach: Gemini Transcribe for the finished
 * recording, and a Gemini TTS model for the reply. TTS reads whatever text it
 * gets aloud, so only the reply itself is sent (no style instructions).
 */
export class GeminiVoice implements VoiceProvider {
  readonly name = 'gemini';
  private readonly ai: GoogleGenAI;

  constructor(apiKey: string) {
    if (!apiKey) throw new VoiceError('GEMINI_API_KEY is not set', 'stt');
    this.ai = new GoogleGenAI({ apiKey });
  }

  /** One retry for overload and rate limits (Gemini answers 503 under load), within the stage's time budget. */
  private async call(params: GenerateContentParameters, timeoutMs: number, stage: 'stt' | 'tts'): Promise<GenerateContentResponse> {
    const deadline = Date.now() + timeoutMs;
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.ai.models.generateContent({
          ...params,
          config: { ...params.config, abortSignal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) },
        });
      } catch (error) {
        const transient = error instanceof ApiError && (error.status === 503 || error.status === 429 || error.status >= 500);
        if (!transient || attempt > 0 || deadline - Date.now() < 3000) {
          throw new VoiceError(stage === 'stt' ? 'Speech-to-text request failed' : 'Text-to-speech request failed', stage);
        }
        await new Promise((r) => setTimeout(r, 600));
      }
    }
  }

  async transcribe(audio: Buffer, mimeType: string): Promise<string> {
    const response = await this.call(
      {
        model: VOICE.sttModel,
        contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mimeType === 'audio/m4a' ? 'audio/mp4' : mimeType, data: audio.toString('base64') } }] }],
      },
      TIMEOUTS.sttMs,
      'stt',
    );
    // Transcribe answers in an audioTranscription part; other models answer in text.
    const parts = (response.candidates?.[0]?.content?.parts ?? []) as { text?: string; audioTranscription?: { text?: string } }[];
    return parts
      .map((part) => part.audioTranscription?.text ?? part.text ?? '')
      .join(' ')
      .trim();
  }

  async synthesize(text: string): Promise<SpeechAudio> {
    const response = await this.call(
      {
        model: VOICE.ttsModel,
        contents: [{ role: 'user', parts: [{ text: text.slice(0, 2000) }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE.ttsVoice } } },
        },
      },
      TIMEOUTS.ttsMs,
      'tts',
    );
    const inline = response.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData;
    const data = Buffer.from(inline?.data ?? '', 'base64');
    if (data.length === 0) throw new VoiceError('Text-to-speech returned no audio', 'tts');
    // Current models return a WAV file; older ones returned raw 24 kHz 16-bit PCM.
    return { data: data.subarray(0, 4).toString('latin1') === 'RIFF' ? data : wav(data), mimeType: 'audio/wav' };
  }
}

function wav(pcm: Buffer, rate = 24_000): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
