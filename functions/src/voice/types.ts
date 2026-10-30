import type { CoachVoice } from '../contract.js';

/** `tokens` is what the provider billed, counted against the daily allowance. */
export type SpeechAudio = { data: Buffer; mimeType: 'audio/wav'; tokens: number };
export type Transcript = { text: string; tokens: number };

export interface VoiceProvider {
  readonly name: string;
  /** The transcript is '' when no speech was recognised. */
  transcribe(audio: Buffer, mimeType: string): Promise<Transcript>;
  /** Spoken audio of the text, in the chosen coach voice. */
  synthesize(text: string, voice: CoachVoice): Promise<SpeechAudio>;
}

export class VoiceError extends Error {
  constructor(message: string, readonly stage: 'stt' | 'tts') {
    super(message);
  }
}
