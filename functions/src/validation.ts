import { LIMITS } from './config.js';
import {
  VOICE_MIME_TYPES,
  type CoachTurnRequest,
  type ConversationMode,
  type VoiceMimeType,
  type VoiceTurnRequest,
} from './contract.js';
import { CoachError } from './errors.js';

const ID = /^[A-Za-z0-9_-]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Raw = Record<string, unknown>;

function asObject(data: unknown): Raw {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new CoachError('invalid-input');
  return data as Raw;
}

function id(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > LIMITS.idMaxChars || !ID.test(value)) {
    throw new CoachError('invalid-input');
  }
  return value;
}

function mode(value: unknown): ConversationMode | undefined {
  if (value === undefined || value === null) return undefined;
  if (value === 'normal' || value === 'reflection') return value;
  throw new CoachError('invalid-input');
}

function isoDate(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string' && ISO_DATE.test(value)) return value;
  throw new CoachError('invalid-input');
}

/** Normalises whitespace the same way for hashing and storage. */
export function normaliseText(text: string): string {
  return text.replace(/\r\n?/g, '\n').trim();
}

export function parseCoachTurnRequest(data: unknown): CoachTurnRequest {
  const raw = asObject(data);
  if (typeof raw.text !== 'string') throw new CoachError('invalid-input');
  const text = normaliseText(raw.text);
  if (text.length < 1 || text.length > LIMITS.textMaxChars) throw new CoachError('invalid-input');
  const m = mode(raw.mode);
  const reflectionCheckInId = isoDate(raw.reflectionCheckInId);
  return {
    conversationId: id(raw.conversationId),
    clientTurnId: id(raw.clientTurnId),
    text,
    ...(m ? { mode: m } : {}),
    ...(reflectionCheckInId ? { reflectionCheckInId } : {}),
  };
}

export function parseVoiceTurnRequest(data: unknown): VoiceTurnRequest & { audio: Buffer } {
  const raw = asObject(data);
  if (typeof raw.audioBase64 !== 'string' || raw.audioBase64.length === 0) throw new CoachError('invalid-input');
  if (!VOICE_MIME_TYPES.includes(raw.mimeType as VoiceMimeType)) throw new CoachError('invalid-input');
  // base64 decodes to ~3/4 of its length; reject before allocating anything large.
  if (raw.audioBase64.length > Math.ceil((LIMITS.audioMaxBytes * 4) / 3) + 4) throw new CoachError('invalid-input');
  if (!/^[A-Za-z0-9+/=\s]+$/.test(raw.audioBase64)) throw new CoachError('invalid-input');
  const audio = Buffer.from(raw.audioBase64, 'base64');
  if (audio.length < 256 || audio.length > LIMITS.audioMaxBytes) throw new CoachError('invalid-input');
  if (raw.wantAudio !== undefined && typeof raw.wantAudio !== 'boolean') throw new CoachError('invalid-input');
  const m = mode(raw.mode);
  const reflectionCheckInId = isoDate(raw.reflectionCheckInId);
  return {
    conversationId: id(raw.conversationId),
    clientTurnId: id(raw.clientTurnId),
    audioBase64: raw.audioBase64,
    mimeType: raw.mimeType as VoiceMimeType,
    wantAudio: raw.wantAudio !== false,
    audio,
    ...(m ? { mode: m } : {}),
    ...(reflectionCheckInId ? { reflectionCheckInId } : {}),
  };
}
