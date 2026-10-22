export type SpeechAudio = { data: Buffer; mimeType: 'audio/wav' };

export interface VoiceProvider {
  readonly name: string;
  /** Returns the transcript ('' when no speech was recognised). */
  transcribe(audio: Buffer, mimeType: string): Promise<string>;
  /** Spoken audio of the text. */
  synthesize(text: string): Promise<SpeechAudio>;
}

export class VoiceError extends Error {
  constructor(message: string, readonly stage: 'stt' | 'tts') {
    super(message);
  }
}
