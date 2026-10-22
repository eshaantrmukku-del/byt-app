import type { CoachThinking, Plan } from './contract.js';

const envInt = (name: string, fallback: number) => {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * Daily AI allowance in Gemini tokens (input + output + thinking + voice), per UTC day.
 * A typical text turn is roughly 8–12k tokens. Plus is hidden and not purchasable
 * during the beta; it gets the same allowance for now. Tunable via functions/.env.
 */
export const DAILY_TOKEN_LIMIT: Record<Plan, number> = {
  standard: envInt('BYT_DAILY_TOKENS', 200_000),
  plus: envInt('BYT_DAILY_TOKENS_PLUS', 200_000),
};
export const DEFAULT_PLAN: Plan = 'standard';

/**
 * Held against the allowance while a metered turn runs, then settled to the real
 * count. It stops parallel sends from running far past the limit.
 */
export const TOKEN_RESERVE = envInt('BYT_TOKEN_RESERVE', 12_000);

/** How hard the reply model thinks. The user picks the level; the default is the app's. */
export const THINKING = {
  default: 'standard' as CoachThinking,
  level: { standard: 'low', deeper: 'medium', deepest: 'high' } as const,
  /** More thinking takes longer; these are the reply-call budgets. */
  replyTimeoutMs: { standard: 25_000, deeper: 35_000, deepest: 45_000 } as const,
};

export const LIMITS = {
  textMaxChars: 4000,
  /** requestId is 8–64; Firestore conversation ids are shorter, so ids allow 1–64. */
  requestIdMin: 8,
  idMaxChars: 64,
  /** Matches the app: base64 length, not decoded bytes. About 2 MB of audio. */
  audioMaxBase64: 2_800_000,
  audioMaxDurationMs: 60_000,
  previewChars: 120,
  /** A running turn holds its idempotency record this long; a crashed run can then be retried. */
  turnLeaseMs: 90_000,
  rate: { perMinute: 8, perHour: 60 },
} as const;

export const CONTEXT = {
  checkInDays: 14,
  historyMessages: 16,
  /** Summarise once this many messages sit outside the recent window and aren't summarised yet. */
  summariseAfterUnsummarised: 8,
  journalEntries: 5,
  journalCharsPerEntry: 600,
} as const;

/**
 * Model ids are pinned (no -latest aliases) and overridable per environment
 * through functions/.env (BYT_REPLY_MODEL etc.) without an app release.
 */
export const MODELS = {
  reply: process.env.BYT_REPLY_MODEL || 'gemini-3.8-flash',
  analysis: process.env.BYT_ANALYSIS_MODEL || 'gemini-3.5-flash-lite',
  summary: process.env.BYT_SUMMARY_MODEL || 'gemini-3.5-flash-lite',
} as const;

/** Gemini voice (same key as the coach). Overridable through functions/.env. */
export const VOICE = {
  sttModel: process.env.BYT_STT_MODEL || 'gemini-3.5-transcribe',
  ttsModel: process.env.BYT_TTS_MODEL || 'gemini-3.8-flash-lite-tts',
  /** A warm, calm prebuilt voice. */
  ttsVoice: process.env.BYT_TTS_VOICE || 'Sulafat',
} as const;

export const TIMEOUTS = {
  analysisMs: 8_000,
  replyMs: 25_000,
  summaryMs: 10_000,
  sttMs: 20_000,
  ttsMs: 15_000,
} as const;
