import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { defineSecret } from 'firebase-functions/params';
import { onCall, type CallableOptions, type CallableRequest } from 'firebase-functions/v2/https';

import { FUNCTIONS_REGION } from './contract.js';
import { CoachError, toHttpsError } from './errors.js';
import { GeminiClient } from './llm/gemini.js';
import { MockLlm } from './llm/mock.js';
import type { LlmClient } from './llm/types.js';
import { handleCoachTurn, handleGetAccount, handleVoiceTurn, type TurnDeps } from './turn/handlers.js';
import { DeepgramVoice, MockVoice } from './voice/deepgram.js';
import type { VoiceProvider } from './voice/types.js';

initializeApp();
const db = getFirestore();

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const DEEPGRAM_API_KEY = defineSecret('DEEPGRAM_API_KEY');

/** Offline providers are only ever allowed inside the local emulator. */
const MOCK = process.env.FUNCTIONS_EMULATOR === 'true' && process.env.BYT_LLM_MODE === 'mock';

let gemini: LlmClient | undefined;
let deepgram: VoiceProvider | undefined;

function llm(): LlmClient {
  if (MOCK) return (gemini ??= new MockLlm());
  const key = GEMINI_API_KEY.value();
  if (!key) throw new CoachError('not-configured');
  return (gemini ??= new GeminiClient(key));
}

function voice(): VoiceProvider {
  if (MOCK) return (deepgram ??= new MockVoice());
  const key = DEEPGRAM_API_KEY.value();
  if (!key) throw new CoachError('not-configured');
  return (deepgram ??= new DeepgramVoice(key));
}

const deps: TurnDeps = {
  db,
  llm,
  voice,
  now: Date.now,
  // Structured, content-free logs: ids, moves, latencies and outcomes — never message text.
  log: (event, fields) => logger.info(event, fields),
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

export const coachTurn = onCall(
  { ...base, secrets: [GEMINI_API_KEY], timeoutSeconds: 60 },
  wrap((req) => handleCoachTurn(deps, { uid: req.auth?.uid }, req.data)),
);

export const voiceTurn = onCall(
  { ...base, secrets: [GEMINI_API_KEY, DEEPGRAM_API_KEY], timeoutSeconds: 90, memory: '1GiB' },
  wrap((req) => handleVoiceTurn(deps, { uid: req.auth?.uid }, req.data)),
);

export const getAccount = onCall(
  { ...base, timeoutSeconds: 15 },
  wrap((req) => handleGetAccount(deps, { uid: req.auth?.uid })),
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
