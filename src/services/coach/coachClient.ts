import * as Crypto from 'expo-crypto';
import { httpsCallable } from 'firebase/functions';

import { requireFirebase } from '@/lib/firebase';

import { CoachError, toCoachError } from './errors';
import {
  COACH_ID_PATTERN,
  COACH_TEXT_LIMIT,
  VOICE_MAX_BYTES,
  type AccountSnapshot,
  type CoachTurnRequest,
  type CoachTurnResponse,
  type GoalProgressProposal,
  type VoiceTurnRequest,
  type VoiceTurnResponse,
} from './types';

const TEXT_TIMEOUT_MS = 60_000;
const VOICE_TIMEOUT_MS = 90_000;
const ACCOUNT_TIMEOUT_MS = 20_000;
const IN_PROGRESS_RETRIES = 3;
const IN_PROGRESS_DELAY_MS = 2_000;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Idempotency key for one user turn. Reuse it when retrying the same turn. */
export function newRequestId(): string {
  return Crypto.randomUUID().replace(/-/g, '');
}

function decodedAudioBytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function requireId(value: string) {
  if (!COACH_ID_PATTERN.test(value)) throw new CoachError('invalid-input');
}

function readProposal(value: unknown): GoalProgressProposal | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const p = value as Record<string, unknown>;
  if (typeof p.goalId !== 'string' || !COACH_ID_PATTERN.test(p.goalId)) return undefined;
  if (typeof p.progress !== 'number' || !Number.isFinite(p.progress)) return undefined;
  return {
    goalId: p.goalId,
    progress: Math.min(100, Math.max(0, Math.round(p.progress))),
    reason: typeof p.reason === 'string' ? p.reason : '',
  };
}

function readTurn(data: unknown): CoachTurnResponse {
  const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  if (d.ok !== true || typeof d.reply !== 'string' || typeof d.creditsRemaining !== 'number') {
    throw new CoachError('unknown');
  }
  const proposal = readProposal(d.proposal);
  return {
    ok: true,
    clientTurnId: typeof d.clientTurnId === 'string' ? d.clientTurnId : '',
    conversationId: typeof d.conversationId === 'string' ? d.conversationId : '',
    userMessageId: typeof d.userMessageId === 'string' ? d.userMessageId : '',
    coachMessageId: typeof d.coachMessageId === 'string' ? d.coachMessageId : '',
    reply: d.reply,
    creditsRemaining: d.creditsRemaining,
    replayed: d.replayed === true,
    ...(proposal ? { proposal } : {}),
  };
}

async function invoke<Req, Res>(name: string, data: Req, timeout: number, retryInProgress: boolean): Promise<Res> {
  const fn = httpsCallable<Req, Res>(requireFirebase().functions, name, { timeout });
  for (let attempt = 0; ; attempt += 1) {
    try {
      return (await fn(data)).data;
    } catch (error) {
      const coachError = toCoachError(error);
      if (retryInProgress && coachError.reason === 'turn-in-progress' && attempt < IN_PROGRESS_RETRIES) {
        await delay(coachError.retryAfterMs ?? IN_PROGRESS_DELAY_MS);
        continue;
      }
      throw coachError;
    }
  }
}

export type CoachClient = {
  coachTurn: (request: CoachTurnRequest) => Promise<CoachTurnResponse>;
  voiceTurn: (request: VoiceTurnRequest) => Promise<VoiceTurnResponse>;
  getAccount: () => Promise<AccountSnapshot>;
  deleteAccount: () => Promise<void>;
};

export const coachClient: CoachClient = {
  coachTurn: async (request) => {
    requireId(request.conversationId);
    requireId(request.clientTurnId);
    const text = request.text.trim();
    if (!text || text.length > COACH_TEXT_LIMIT) throw new CoachError('invalid-input');
    const data = await invoke<CoachTurnRequest, unknown>(
      'coachTurn',
      { ...request, text },
      TEXT_TIMEOUT_MS,
      true
    );
    return readTurn(data);
  },
  voiceTurn: async (request) => {
    requireId(request.conversationId);
    requireId(request.clientTurnId);
    if (!request.audioBase64 || decodedAudioBytes(request.audioBase64) > VOICE_MAX_BYTES) {
      throw new CoachError('invalid-input');
    }
    const data = await invoke<VoiceTurnRequest, unknown>('voiceTurn', request, VOICE_TIMEOUT_MS, true);
    const turn = readTurn(data);
    const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
    return {
      ...turn,
      transcript: typeof d.transcript === 'string' ? d.transcript : '',
      audioBase64: typeof d.audioBase64 === 'string' ? d.audioBase64 : null,
      audioMimeType: d.audioMimeType === 'audio/mpeg' ? 'audio/mpeg' : null,
    };
  },
  getAccount: async () => {
    const data = await invoke<Record<string, never>, unknown>('getAccount', {}, ACCOUNT_TIMEOUT_MS, false);
    const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
    if (typeof d.creditsRemaining !== 'number' || typeof d.creditsPeriodKey !== 'string') {
      throw new CoachError('unknown');
    }
    return {
      plan: d.plan === 'plus' ? 'plus' : 'standard',
      creditsRemaining: d.creditsRemaining,
      monthlyAllowance: typeof d.monthlyAllowance === 'number' ? d.monthlyAllowance : 150,
      creditsPeriodKey: d.creditsPeriodKey,
      resetsAt: typeof d.resetsAt === 'number' ? d.resetsAt : 0,
    };
  },
  deleteAccount: async () => {
    const data = await invoke<{ confirm: 'DELETE' }, unknown>('deleteAccount', { confirm: 'DELETE' }, ACCOUNT_TIMEOUT_MS, false);
    const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
    if (d.ok !== true) throw new CoachError('unknown');
  },
};
