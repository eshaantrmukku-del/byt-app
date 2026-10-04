export interface VoiceProvider {
  readonly name: string;
  /** Returns the transcript ('' when no speech was recognised). */
  transcribe(audio: Buffer, mimeType: string): Promise<string>;
  /** MP3 audio of the text. */
  synthesize(text: string): Promise<Buffer>;
}

export class VoiceError extends Error {
  constructor(message: string, readonly stage: 'stt' | 'tts') {
    super(message);
  }
}
