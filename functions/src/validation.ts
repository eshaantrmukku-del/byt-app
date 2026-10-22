import { LIMITS } from './config.js';
import {
  COACH_THINKING,
  VOICE_MIME_TYPES,
  type CoachThinking,
  type CoachTurnRequest,
  type ConversationMode,
  type VoiceAudioRequest,
  type VoiceMimeType,
  type VoiceTurnRequest,
} from './contract.js';
import { CoachError } from './errors.js';

const ID = /^[A-Za-z0-9_-]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Raw = Record<string, unknown>;

function asObject(data: unknown): Raw {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new CoachError('invalid-request');
  return data as Raw;
}

function id(value: unknown, min: number): string {
  if (typeof value !== 'string' || value.length < min || value.length > LIMITS.idMaxChars || !ID.test(value)) {
    throw new CoachError('invalid-request');
  }
  return value;
}

function mode(value: unknown): ConversationMode {
  if (value === 'normal' || value === 'reflection') return value;
  throw new CoachError('invalid-request');
}

function isoDate(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string' && ISO_DATE.test(value)) return value;
  throw new CoachError('invalid-request');
}

/** Normalises whitespace the same way for hashing and storage. */
export function normaliseText(text: string): string {
  return text.replace(/\r\n?/g, '\n').trim();
}

function thinking(value: unknown): CoachThinking | undefined {
  if (value === undefined || value === null) return undefined;
  if (COACH_THINKING.includes(value as CoachThinking)) return value as CoachThinking;
  throw new CoachError('invalid-request');
}

function target(raw: Raw) {
  const conversationMode = mode(raw.mode);
  const level = thinking(raw.thinking);
  const reflectionCheckInId = isoDate(raw.reflectionCheckInId);
  if (conversationMode === 'reflection' && !reflectionCheckInId) throw new CoachError('invalid-request');
  return {
    requestId: id(raw.requestId, LIMITS.requestIdMin),
    conversationId: id(raw.conversationId, 1),
    mode: conversationMode,
    ...(reflectionCheckInId ? { reflectionCheckInId } : {}),
    ...(level ? { thinking: level } : {}),
  };
}

/** Parts beyond this are never produced (see voiceParts). */
export const MAX_AUDIO_PARTS = 6;

export function parseVoiceAudioRequest(data: unknown): VoiceAudioRequest {
  const raw = asObject(data);
  const part = raw.part;
  if (typeof part !== 'number' || !Number.isInteger(part) || part < 1 || part >= MAX_AUDIO_PARTS) throw new CoachError('invalid-request');
  return { requestId: id(raw.requestId, LIMITS.requestIdMin), part };
}

export function parseCoachTurnRequest(data: unknown): CoachTurnRequest {
  const raw = asObject(data);
  const base = target(raw);
  if (raw.kind !== 'message' && raw.kind !== 'opener') throw new CoachError('invalid-request');
  if (raw.kind === 'opener') return { ...base, kind: 'opener' };
  if (typeof raw.text !== 'string') throw new CoachError('invalid-request');
  const text = normaliseText(raw.text);
  if (text.length < 1) throw new CoachError('invalid-request');
  if (text.length > LIMITS.textMaxChars) throw new CoachError('text-too-long');
  return { ...base, kind: 'message', text };
}

export function parseVoiceTurnRequest(data: unknown): VoiceTurnRequest & { audioBytes: Buffer } {
  const raw = asObject(data);
  const base = target(raw);
  const audio = asObject(raw.audio);
  if (typeof audio.base64 !== 'string' || audio.base64.length === 0) throw new CoachError('invalid-request');
  if (!VOICE_MIME_TYPES.includes(audio.mimeType as VoiceMimeType)) throw new CoachError('invalid-request');
  if (typeof audio.durationMs !== 'number' || !Number.isFinite(audio.durationMs) || audio.durationMs <= 0) {
    throw new CoachError('invalid-request');
  }
  if (audio.durationMs > LIMITS.audioMaxDurationMs || audio.base64.length > LIMITS.audioMaxBase64) {
    throw new CoachError('audio-too-long');
  }
  if (!/^[A-Za-z0-9+/=\s]+$/.test(audio.base64)) throw new CoachError('invalid-request');
  const audioBytes = Buffer.from(audio.base64, 'base64');
  if (audioBytes.length < 32) throw new CoachError('invalid-request');
  if (raw.wantAudio !== undefined && typeof raw.wantAudio !== 'boolean') throw new CoachError('invalid-request');
  return {
    ...base,
    audio: { base64: audio.base64, mimeType: audio.mimeType as VoiceMimeType, durationMs: audio.durationMs },
    wantAudio: raw.wantAudio !== false,
    audioBytes,
  };
}
