import * as Crypto from 'expo-crypto';
import { httpsCallable } from 'firebase/functions';

import { requireFirebase } from '@/lib/firebase';

import { CoachError, toCoachError } from './errors';
import type { CoachTurnRequest, CoachTurnResponse, VoiceTurnRequest, VoiceTurnResponse } from './types';

const TEXT_TIMEOUT_MS = 60_000;
const VOICE_TIMEOUT_MS = 90_000;
const IN_PROGRESS_RETRIES = 3;
const IN_PROGRESS_DELAY_MS = 2_000;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Idempotency key for one user turn. Reuse it when retrying the same turn. */
export function newRequestId(): string {
  return Crypto.randomUUID().replace(/-/g, '');
}

/** Deterministic id so a session opener is generated at most once per conversation. */
export function openerRequestId(conversationId: string): string {
  return `opener_${conversationId}`.slice(0, 64);
}

async function call<Req, Res>(name: 'coachTurn' | 'voiceTurn', data: Req, timeout: number): Promise<Res> {
  const fn = httpsCallable<Req, Res>(requireFirebase().functions, name, { timeout });
  for (let attempt = 0; ; attempt += 1) {
    try {
      return (await fn(data)).data;
    } catch (error) {
      const coachError = toCoachError(error);
      // The backend is still finishing an earlier attempt of this same turn.
      if (coachError.reason === 'in-progress' && attempt < IN_PROGRESS_RETRIES) {
        await delay(IN_PROGRESS_DELAY_MS);
        continue;
      }
      throw coachError;
    }
  }
}

export type CoachClient = {
  coachTurn: (request: CoachTurnRequest) => Promise<CoachTurnResponse>;
  voiceTurn: (request: VoiceTurnRequest) => Promise<VoiceTurnResponse>;
};

export const coachClient: CoachClient = {
  coachTurn: (request) => {
    if (request.kind === 'message' && !request.text.trim()) {
      return Promise.reject(new CoachError('invalid-request'));
    }
    return call('coachTurn', request, TEXT_TIMEOUT_MS);
  },
  voiceTurn: (request) => call('voiceTurn', request, VOICE_TIMEOUT_MS),
};
