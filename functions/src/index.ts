import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { defineSecret } from 'firebase-functions/params';
import { onCall, type CallableOptions, type CallableRequest } from 'firebase-functions/v2/https';

import { FUNCTIONS_REGION } from './contract.js';
import { CoachError, toHttpsError } from './errors.js';
import { GeminiClient } from './llm/gemini.js';
import { GROQ_MODELS, GroqClient } from './llm/groq.js';
import { MockLlm } from './llm/mock.js';
import type { LlmClient } from './llm/types.js';
import { handleCoachTurn, handleGetAccount, handleVoiceAudio, handleVoicePreview, handleVoiceTurn, type TurnDeps } from './turn/handlers.js';
import { GeminiVoice } from './voice/gemini.js';
import { GroqVoice } from './voice/groq.js';
import { MockVoice } from './voice/mock.js';
import type { VoiceProvider } from './voice/types.js';

initializeApp();
const db = getFirestore();

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

/** Offline providers, and Groq for comparing models, are only ever allowed inside the local emulator. */
const EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';
const MOCK = EMULATOR && process.env.BYT_LLM_MODE === 'mock';
const GROQ = EMULATOR && process.env.BYT_LLM_MODE === 'groq';
/** The real Gemini code path in the emulator, for testing on a phone before launch. */
const GEMINI_TEST = EMULATOR && process.env.BYT_LLM_MODE === 'gemini';

function geminiKey(): string {
  return GEMINI_TEST ? (process.env.BYT_GEMINI_TEST_KEY ?? '') : GEMINI_API_KEY.value();
}

let gemini: LlmClient | undefined;
let geminiVoice: VoiceProvider | undefined;

function llm(): LlmClient {
  if (MOCK) return (gemini ??= new MockLlm());
  if (GROQ) return (gemini ??= new GroqClient(process.env.GROQ_API_KEY ?? ''));
  const key = geminiKey();
  if (!key) throw new CoachError('not-configured');
  return (gemini ??= new GeminiClient(key));
}

function voice(): VoiceProvider {
  if (GROQ) return (geminiVoice ??= new GroqVoice(process.env.GROQ_API_KEY ?? ''));
  if (MOCK) return (geminiVoice ??= new MockVoice({ playable: true }));
  const key = geminiKey();
  if (!key) throw new CoachError('not-configured');
  return (geminiVoice ??= new GeminiVoice(key));
}

const deps: TurnDeps = {
  db,
  llm,
  voice,
  now: Date.now,
  // Structured, content-free logs: ids, moves, latencies and outcomes — never message text.
  log: (event, fields) => logger.info(event, fields),
  ...(GROQ ? { engineOptions: { models: GROQ_MODELS } } : {}),
};

const base: CallableOptions = {
  region: FUNCTIONS_REGION,
  enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true',
  memory: '512MiB',
  concurrency: 40,
  maxInstances: 20,
};

function wrap<T>(fn: (req: CallableRequest) => Promise<T>) {
  return async (req: CallableRequest): Promise<T> => {
    try {
      return await fn(req);
    } catch (error) {
      if (!(error instanceof CoachError)) logger.error('callable_error', { name: (error as Error)?.name, uid: req.auth?.uid });
      throw toHttpsError(error);
    }
  };
}

// Deepest thinking can take most of a minute on its own; leave room for a guarded rewrite.
export const coachTurn = onCall(
  { ...base, secrets: [GEMINI_API_KEY], timeoutSeconds: 120 },
  wrap((req) => handleCoachTurn(deps, { uid: req.auth?.uid }, req.data)),
);

export const voiceTurn = onCall(
  { ...base, secrets: [GEMINI_API_KEY], timeoutSeconds: 120, memory: '1GiB' },
  wrap((req) => handleVoiceTurn(deps, { uid: req.auth?.uid }, req.data)),
);

/** Later parts of a spoken reply, fetched while the first part plays. */
export const voiceAudio = onCall(
  { ...base, secrets: [GEMINI_API_KEY], timeoutSeconds: 30 },
  wrap((req) => handleVoiceAudio(deps, { uid: req.auth?.uid }, req.data)),
);

/** A short sample of a coach voice, for choosing one in Settings. */
export const voicePreview = onCall(
  { ...base, secrets: [GEMINI_API_KEY], timeoutSeconds: 30 },
  wrap((req) => handleVoicePreview(deps, { uid: req.auth?.uid }, req.data)),
);

export const getAccount = onCall(
  // Long enough for the one-time import of a large prototype account.
  { ...base, timeoutSeconds: 60 },
  wrap((req) => handleGetAccount(deps, { uid: req.auth?.uid }, req.data)),
);

export const deleteAccount = onCall(
  { ...base, timeoutSeconds: 120 },
  wrap(async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new CoachError('unauthenticated');
    if ((req.data as { confirm?: unknown } | null)?.confirm !== 'DELETE') throw new CoachError('invalid-request');
    await db.recursiveDelete(db.collection('users').doc(uid));
    await getAuth().deleteUser(uid);
    logger.info('account_deleted', { uid });
    return { ok: true as const };
  }),
);
