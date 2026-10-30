import * as Crypto from 'expo-crypto';
import { httpsCallable } from 'firebase/functions';

import { requireFirebase } from '@/lib/firebase';
import { usePreferencesStore } from '@/stores/preferencesStore';

import { CoachError, toCoachError } from './errors';
import {
  COACH_TEXT_LIMIT,
  COACH_THINKING,
  COACH_VOICES,
  REQUEST_ID_PATTERN,
  VOICE_MAX_BASE64_LENGTH,
  VOICE_MAX_DURATION_MS,
  type AccountSnapshot,
  type CoachMessagePayload,
  type CoachThinking,
  type CoachTurnRequest,
  type CoachTurnResponse,
  type CoachVoice,
  type GoalProgressProposal,
  type ReplyAudio,
  type UsageSnapshot,
  type VoiceAudioMimeType,
  type VoiceTurnRequest,
  type VoiceTurnResponse,
} from './types';

// Matches the callables' limits (deepest thinking can take most of a minute).
const TEXT_TIMEOUT_MS = 120_000;
const VOICE_TIMEOUT_MS = 125_000;
const ACCOUNT_TIMEOUT_MS = 20_000;
const AUDIO_PART_TIMEOUT_MS = 30_000;
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

function readUsage(value: unknown): Omit<UsageSnapshot, 'metered'> | null {
  const u = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  if (typeof u.used !== 'number' || typeof u.limit !== 'number' || !(u.limit > 0)) return null;
  return { used: Math.max(0, u.used), limit: u.limit, resetsAt: typeof u.resetsAt === 'number' ? u.resetsAt : 0 };
}

function readAudio(value: unknown): ReplyAudio | null {
  const a = (typeof value === 'object' && value !== null ? value : null) as Record<string, unknown> | null;
  return a && typeof a.base64 === 'string' && a.base64 && a.mimeType === 'audio/wav' ? { base64: a.base64, mimeType: 'audio/wav' } : null;
}

function readTurn(data: unknown): CoachTurnResponse {
  const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  const reply = readMessage(d.reply);
  const usage = readUsage(d.usage);
  if (!reply || !usage) throw new CoachError('unknown');
  const userMessage = d.userMessage == null ? null : readMessage(d.userMessage);
  if (d.userMessage != null && !userMessage) throw new CoachError('unknown');
  const proposal = readProposal(d.proposal);
  return {
    requestId: typeof d.requestId === 'string' ? d.requestId : '',
    conversationId: typeof d.conversationId === 'string' ? d.conversationId : '',
    replayed: d.replayed === true,
    userMessage,
    reply,
    usage: { ...usage, metered: (d.usage as Record<string, unknown>).metered === true },
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

/** The thinking level chosen in Settings, unless the caller set one. */
function withThinking<T extends { thinking?: CoachThinking }>(request: T): T {
  const level = request.thinking ?? usePreferencesStore.getState().coachThinking;
  return { ...request, thinking: COACH_THINKING.includes(level) ? level : 'standard' };
}

/** The voice chosen in Settings, unless the caller set one. */
function chosenVoice(voice?: CoachVoice): CoachVoice {
  const value = voice ?? usePreferencesStore.getState().coachVoice;
  return COACH_VOICES.includes(value) ? value : 'ivy';
}

export type CoachClient = {
  coachTurn: (request: CoachTurnRequest) => Promise<CoachTurnResponse>;
  voiceTurn: (request: VoiceTurnRequest) => Promise<VoiceTurnResponse>;
  /** A later part of a finished voice turn's spoken reply. Null if it couldn't be made. */
  voiceAudio: (requestId: string, part: number, voice?: CoachVoice) => Promise<ReplyAudio | null>;
  /** A few seconds of a coach voice, for choosing one. Free. */
  voicePreview: (voice: CoachVoice) => Promise<ReplyAudio | null>;
  getAccount: () => Promise<AccountSnapshot>;
  deleteAccount: () => Promise<void>;
};

export const coachClient: CoachClient = {
  coachTurn: async (request) => {
    assertTarget(request);
    if (request.kind === 'opener') {
      return readTurn(await invoke('coachTurn', withThinking({ ...request, text: undefined }), TEXT_TIMEOUT_MS, true));
    }
    const text = request.text.trim();
    if (!text) throw new CoachError('invalid-request');
    if (text.length > COACH_TEXT_LIMIT) throw new CoachError('text-too-long');
    return readTurn(await invoke('coachTurn', withThinking({ ...request, text }), TEXT_TIMEOUT_MS, true));
  },
  voiceTurn: async (request) => {
    assertTarget(request);
    const { audio } = request;
    if (!AUDIO_MIME.includes(audio.mimeType) || audio.durationMs <= 0) throw new CoachError('invalid-request');
    if (audio.durationMs > VOICE_MAX_DURATION_MS) throw new CoachError('audio-too-long');
    if (!audio.base64 || audio.base64.length > VOICE_MAX_BASE64_LENGTH) throw new CoachError('audio-too-long');
    const data = await invoke<VoiceTurnRequest, unknown>('voiceTurn', withThinking({ ...request, voice: chosenVoice(request.voice) }), VOICE_TIMEOUT_MS, true);
    const turn = readTurn(data);
    const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
    const replyAudio = readAudio(d.replyAudio);
    const audioParts = replyAudio && typeof d.audioParts === 'number' && Number.isInteger(d.audioParts) ? Math.max(1, Math.min(6, d.audioParts)) : 0;
    return { ...turn, transcript: typeof d.transcript === 'string' ? d.transcript : '', replyAudio, audioParts };
  },
  voiceAudio: async (requestId, part, voice) => {
    requireRequestId(requestId);
    const data = await invoke<{ requestId: string; part: number; voice: CoachVoice }, unknown>(
      'voiceAudio',
      { requestId, part, voice: chosenVoice(voice) },
      AUDIO_PART_TIMEOUT_MS,
      false
    );
    return readAudio((data as Record<string, unknown> | null)?.replyAudio);
  },
  voicePreview: async (voice) => {
    if (!COACH_VOICES.includes(voice)) throw new CoachError('invalid-request');
    const data = await invoke<{ voice: CoachVoice }, unknown>('voicePreview', { voice }, AUDIO_PART_TIMEOUT_MS, false);
    return readAudio((data as Record<string, unknown> | null)?.replyAudio);
  },
  getAccount: async () => {
    // The device zone puts prototype check-ins on the same calendar day the app shows.
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const data = await invoke<{ timeZone?: string }, unknown>('getAccount', timeZone ? { timeZone } : {}, ACCOUNT_TIMEOUT_MS, false);
    const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
    const usage = readUsage(d.usage);
    if (!usage) throw new CoachError('unknown');
    return { plan: d.plan === 'plus' ? 'plus' : 'standard', usage, legacyImported: d.legacyImported === true };
  },
  deleteAccount: async () => {
    const data = await invoke<{ confirm: 'DELETE' }, unknown>('deleteAccount', { confirm: 'DELETE' }, ACCOUNT_TIMEOUT_MS, false);
    const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
    if (d.ok !== true) throw new CoachError('unknown');
  },
};
