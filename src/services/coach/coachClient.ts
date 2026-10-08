import * as Crypto from 'expo-crypto';
import { httpsCallable } from 'firebase/functions';

import { requireFirebase } from '@/lib/firebase';

import { CoachError, toCoachError } from './errors';
import {
  COACH_TEXT_LIMIT,
  REQUEST_ID_PATTERN,
  VOICE_MAX_BASE64_LENGTH,
  VOICE_MAX_DURATION_MS,
  type AccountSnapshot,
  type CoachMessagePayload,
  type CoachTurnRequest,
  type CoachTurnResponse,
  type GoalProgressProposal,
  type VoiceAudioMimeType,
  type VoiceTurnRequest,
  type VoiceTurnResponse,
} from './types';

const TEXT_TIMEOUT_MS = 60_000;
const VOICE_TIMEOUT_MS = 90_000;
const ACCOUNT_TIMEOUT_MS = 20_000;
const IN_PROGRESS_RETRIES = 3;
const IN_PROGRESS_DELAY_MS = 2_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const AUDIO_MIME: readonly VoiceAudioMimeType[] = ['audio/mp4', 'audio/m4a', 'audio/aac', 'audio/webm', 'audio/wav'];

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Idempotency key for one user turn. Reuse it when retrying the same turn. */
export function newRequestId(): string {
  return Crypto.randomUUID().replace(/-/g, '');
}

/** One free opener per conversation. Stable so a retry does not charge or duplicate it. */
export function openerRequestId(conversationId: string): string {
  return `opener_${conversationId}`.slice(0, 64);
}

function requireRequestId(value: string) {
  if (!REQUEST_ID_PATTERN.test(value)) throw new CoachError('invalid-request');
}

function readMessage(value: unknown): CoachMessagePayload | null {
  if (typeof value !== 'object' || value === null) return null;
  const m = value as Record<string, unknown>;
  if (typeof m.id !== 'string' || typeof m.text !== 'string') return null;
  return { id: m.id, text: m.text, createdAt: typeof m.createdAt === 'number' ? m.createdAt : 0 };
}

function readProposal(value: unknown): GoalProgressProposal | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const p = value as Record<string, unknown>;
  if (typeof p.goalId !== 'string' || typeof p.progress !== 'number' || !Number.isFinite(p.progress)) return undefined;
  return {
    goalId: p.goalId,
    progress: Math.min(100, Math.max(0, Math.round(p.progress))),
    reason: typeof p.reason === 'string' ? p.reason : '',
  };
}

function readTurn(data: unknown): CoachTurnResponse {
  const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  const reply = readMessage(d.reply);
  const credits = (typeof d.credits === 'object' && d.credits !== null ? d.credits : {}) as Record<string, unknown>;
  if (!reply || typeof credits.remaining !== 'number') throw new CoachError('unknown');
  const userMessage = d.userMessage == null ? null : readMessage(d.userMessage);
  if (d.userMessage != null && !userMessage) throw new CoachError('unknown');
  const proposal = readProposal(d.proposal);
  return {
    requestId: typeof d.requestId === 'string' ? d.requestId : '',
    conversationId: typeof d.conversationId === 'string' ? d.conversationId : '',
    replayed: d.replayed === true,
    userMessage,
    reply,
    credits: {
      remaining: credits.remaining,
      periodKey: typeof credits.periodKey === 'string' ? credits.periodKey : '',
      charged: credits.charged === 1 ? 1 : 0,
    },
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
      if (retryInProgress && coachError.reason === 'in-progress' && attempt < IN_PROGRESS_RETRIES) {
        await delay((coachError.retryAfterSeconds ?? IN_PROGRESS_DELAY_MS / 1000) * 1000);
        continue;
      }
      throw coachError;
    }
  }
}

function assertTarget(request: { requestId: string; conversationId: string; mode: string; reflectionCheckInId?: string }) {
  requireRequestId(request.requestId);
  requireRequestId(request.conversationId);
  if (request.mode !== 'normal' && request.mode !== 'reflection') throw new CoachError('invalid-request');
  if (request.mode === 'reflection' && !request.reflectionCheckInId) throw new CoachError('check-in-not-found');
  if (request.reflectionCheckInId && !ISO_DATE.test(request.reflectionCheckInId)) throw new CoachError('invalid-request');
}

export type CoachClient = {
  coachTurn: (request: CoachTurnRequest) => Promise<CoachTurnResponse>;
  voiceTurn: (request: VoiceTurnRequest) => Promise<VoiceTurnResponse>;
  getAccount: () => Promise<AccountSnapshot>;
  deleteAccount: () => Promise<void>;
};

export const coachClient: CoachClient = {
  coachTurn: async (request) => {
    assertTarget(request);
    if (request.kind === 'opener') {
      return readTurn(await invoke('coachTurn', { ...request, text: undefined }, TEXT_TIMEOUT_MS, true));
    }
    const text = request.text.trim();
    if (!text) throw new CoachError('invalid-request');
    if (text.length > COACH_TEXT_LIMIT) throw new CoachError('text-too-long');
    return readTurn(await invoke('coachTurn', { ...request, text }, TEXT_TIMEOUT_MS, true));
  },
  voiceTurn: async (request) => {
    assertTarget(request);
    const { audio } = request;
    if (!AUDIO_MIME.includes(audio.mimeType) || audio.durationMs <= 0) throw new CoachError('invalid-request');
    if (audio.durationMs > VOICE_MAX_DURATION_MS) throw new CoachError('audio-too-long');
    if (!audio.base64 || audio.base64.length > VOICE_MAX_BASE64_LENGTH) throw new CoachError('audio-too-long');
    const data = await invoke<VoiceTurnRequest, unknown>('voiceTurn', request, VOICE_TIMEOUT_MS, true);
    const turn = readTurn(data);
    const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
    const audioReply = (typeof d.replyAudio === 'object' && d.replyAudio !== null ? d.replyAudio : null) as Record<string, unknown> | null;
    const replyAudio =
      audioReply && typeof audioReply.base64 === 'string' && audioReply.mimeType === 'audio/mpeg'
        ? { base64: audioReply.base64, mimeType: 'audio/mpeg' as const }
        : null;
    return { ...turn, transcript: typeof d.transcript === 'string' ? d.transcript : '', replyAudio };
  },
  getAccount: async () => {
    const data = await invoke<Record<string, never>, unknown>('getAccount', {}, ACCOUNT_TIMEOUT_MS, false);
    const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
    if (typeof d.creditsRemaining !== 'number' || typeof d.creditsPeriodKey !== 'string') throw new CoachError('unknown');
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
