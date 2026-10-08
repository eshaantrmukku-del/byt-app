import type { Plan } from './contract.js';

/** Plus is hidden and not purchasable during the beta; it gets the same allowance for now. */
export const MONTHLY_ALLOWANCE: Record<Plan, number> = { standard: 150, plus: 150 };
export const DEFAULT_PLAN: Plan = 'standard';

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

export const VOICE = {
  sttModel: process.env.BYT_STT_MODEL || 'nova-3',
  ttsVoice: process.env.BYT_TTS_VOICE || 'aura-2-thalia-en',
} as const;

export const TIMEOUTS = {
  analysisMs: 8_000,
  replyMs: 25_000,
  summaryMs: 10_000,
  sttMs: 20_000,
  ttsMs: 15_000,
} as const;
