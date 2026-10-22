/**
 * Pinned Gemini ids (October 2026). No "-latest" aliases.
 * Prices are USD per 1M tokens on the paid tier; 3.8 / 3.7 / 3.6 Flash are
 * introductory through 31 Dec 2026. Thinking tokens are billed as output.
 */
export type ModelRole = 'reply' | 'analysis' | 'judge';

export type ModelCandidate = {
  id: string;
  role: ModelRole[];
  note: string;
  inputUsd: number;
  outputUsd: number;
};

export const MODEL_SHORTLIST: ModelCandidate[] = [
  {
    id: 'gemini-3.8-flash',
    role: ['reply', 'judge'],
    note: 'Default reply model. Current GA Flash, best conversational quality at chat latency. Thinking level "low" on replies.',
    inputUsd: 0.75,
    outputUsd: 3.75,
  },
  {
    id: 'gemini-3-flash-preview',
    role: ['reply'],
    note: 'Comparison reply model. Cheaper, has a free tier, still a full Flash. Use if 3.8 latency or cost is too high after a live eval.',
    inputUsd: 0.5,
    outputUsd: 3,
  },
  {
    id: 'gemini-3.1-pro-preview',
    role: ['reply', 'judge'],
    note: 'Quality ceiling for a live comparison. No free tier. Not the default: a coaching turn does not need Pro latency.',
    inputUsd: 2,
    outputUsd: 12,
  },
  {
    id: 'gemini-3.5-flash-lite',
    role: ['analysis', 'judge'],
    note: 'Analysis, summary and (optionally) the judge. Structured JSON, not the voice the user hears.',
    inputUsd: 0.3,
    outputUsd: 2.5,
  },
];

export const DEFAULTS = {
  reply: 'gemini-3.8-flash',
  analysis: 'gemini-3.5-flash-lite',
  summary: 'gemini-3.5-flash-lite',
  judge: 'gemini-3.8-flash',
} as const;

/**
 * Voice, for a finished recording (the app does not stream), on the same Gemini
 * key as the coach. Chosen October 2026 on cost and a live round-trip test:
 * Transcribe was word-perfect in about 1 s; Flash Lite TTS took about 2 s for an
 * 8 s reply, about 1 s faster than Flash TTS for the same audio.
 */
export const VOICE_CHOICE = {
  stt: 'gemini-3.5-transcribe',
  tts: 'gemini-3.8-flash-lite-tts (voice Sulafat)',
  why: 'One provider and one key for coach and voice. Transcribe is about $0.005 per minute of audio; TTS is billed as Gemini audio output tokens.',
} as const;
