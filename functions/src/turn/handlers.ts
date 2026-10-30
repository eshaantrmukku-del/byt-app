import { createHash } from 'node:crypto';

import { FieldValue, type Firestore } from 'firebase-admin/firestore';

import { DEFAULT_VOICE, THINKING } from '../config.js';
import {
  coachMessageId,
  userMessageId,
  type AccountResponse,
  type Channel,
  type CoachMessagePayload,
  type CoachThinking,
  type CoachTurnResponse,
  type CoachVoice,
  type ReplyAudio,
  type VoiceAudioResponse,
  type VoicePreviewResponse,
  type VoiceTurnResponse,
} from '../contract.js';
import {
  addTokens,
  beginTurn,
  completeTurn,
  failTurn,
  getOrCreateAccount,
  recordVoiceUserMessage,
  refs,
  usageOf,
  type ConversationState,
  type TurnRecord,
  type Usage,
} from '../credits/ledger.js';
import { runCoachingEngine, type EngineOptions } from '../engine/engine.js';
import { applyMemoryDelta, emptyMemory, readMemory } from '../engine/memory.js';
import type { EngineResult, MemoryDelta } from '../engine/types.js';
import { CoachError } from '../errors.js';
import { importLegacyAccount } from '../legacy/importLegacy.js';
import type { LlmClient } from '../llm/types.js';
import { parseCoachTurnRequest, parseVoiceAudioRequest, parseVoicePreviewRequest, parseVoiceTurnRequest } from '../validation.js';
import { voiceParts } from '../voice/parts.js';
import type { VoiceProvider } from '../voice/types.js';
import { loadCoachContext } from './loadContext.js';

export type TurnLog = (event: string, fields: Record<string, unknown>) => void;

export type TurnDeps = {
  db: Firestore;
  /** Throws CoachError('not-configured') when the provider key is missing. */
  llm: () => LlmClient;
  voice: () => VoiceProvider;
  now: () => number;
  log: TurnLog;
  engineOptions?: EngineOptions;
};

export type CallContext = { uid: string | undefined };

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

/** A retried audio part is served again; anything beyond that is refused (it costs tokens). */
const MAX_PART_FETCHES = 3;

function requireUid(ctx: CallContext): string {
  if (!ctx.uid) throw new CoachError('unauthenticated');
  return ctx.uid;
}

function payload(id: string, text: string, createdAt: number): CoachMessagePayload {
  return { id, text, createdAt };
}

function response(p: {
  requestId: string;
  conversationId: string;
  reply: string;
  replyCreatedAtMs: number;
  userText?: string;
  userCreatedAtMs?: number;
  usage: Usage;
  metered: boolean;
  replayed: boolean;
  proposal?: CoachTurnResponse['proposal'] | null;
}): CoachTurnResponse {
  return {
    requestId: p.requestId,
    conversationId: p.conversationId,
    replayed: p.replayed,
    userMessage: p.userText !== undefined && p.userCreatedAtMs !== undefined
      ? payload(userMessageId(p.requestId), p.userText, p.userCreatedAtMs)
      : null,
    reply: payload(coachMessageId(p.requestId), p.reply, p.replyCreatedAtMs),
    usage: { ...p.usage, metered: p.metered },
    ...(p.proposal ? { proposal: p.proposal } : {}),
  };
}

function engineOptions(deps: TurnDeps, thinking: CoachThinking | undefined): EngineOptions {
  const level = thinking ?? THINKING.default;
  return {
    replyThinking: THINKING.level[level],
    replyTimeoutMs: THINKING.replyTimeoutMs[level],
    ...deps.engineOptions,
  };
}

/**
 * Folds what a finished turn taught the coach into private/coach. Best effort: the turn
 * is already stored, so a failure here is logged and the reply still goes out.
 */
async function updateCoachMemory(deps: TurnDeps, p: { uid: string; requestId: string; conversationId: string; delta: MemoryDelta }) {
  const ref = refs(deps.db, p.uid).coachMemory;
  try {
    await deps.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.exists ? readMemory(snap.data()) : emptyMemory();
      const next = applyMemoryDelta(current, p.delta, { nowMs: deps.now(), conversationId: p.conversationId, commitmentId: p.requestId });
      tx.set(ref, { ...next, updatedAt: FieldValue.serverTimestamp() });
    });
  } catch (error) {
    deps.log('memory_update_failed', { uid: p.uid, requestId: p.requestId, name: (error as Error)?.name });
  }
}

/**
 * Runs the engine for a turn and records the outcome. Any failure before the coach
 * message is stored releases the turn's reservation and surfaces as a retryable error.
 */
async function runTurn(
  deps: TurnDeps,
  p: {
    uid: string;
    requestId: string;
    conversationId: string;
    attempt: number;
    channel: Channel;
    conversation: ConversationState;
    text: string;
    thinking?: CoachThinking;
    /** Tokens already spent on this turn (speech-to-text). */
    extraTokens?: number;
  },
): Promise<{ result: EngineResult; usage: Usage; reply: string; replyCreatedAtMs: number; proposal?: CoachTurnResponse['proposal'] | null }> {
  const started = deps.now();
  let result: EngineResult;
  try {
    const llm = deps.llm();
    const context = await loadCoachContext(deps.db, { uid: p.uid, conversationId: p.conversationId, clientTurnId: p.requestId, conversation: p.conversation, nowMs: started });
    result = await runCoachingEngine(llm, { text: p.text, channel: p.channel, context }, engineOptions(deps, p.thinking));
  } catch (error) {
    await failTurn(deps.db, { uid: p.uid, requestId: p.requestId, attempt: p.attempt, nowMs: deps.now() });
    const reason = error instanceof CoachError ? error.reason : 'provider-unavailable';
    deps.log('turn_failed', { uid: p.uid, requestId: p.requestId, channel: p.channel, stage: 'engine', reason, errorKind: (error as { kind?: string }).kind ?? (error as Error).name });
    throw new CoachError(reason === 'not-configured' ? 'not-configured' : 'provider-unavailable', { refunded: true });
  }

  try {
    const t = result.trace;
    const tokens = t.tokens.input + t.tokens.output + (p.extraTokens ?? 0);
    const { turn, usage } = await completeTurn(deps.db, {
      uid: p.uid,
      requestId: p.requestId,
      conversationId: p.conversationId,
      channel: p.channel,
      reply: result.reply,
      move: result.trace.plan.primary,
      nowMs: deps.now(),
      tokens,
      ...(result.proposal ? { proposal: result.proposal } : {}),
      ...(result.summary ? { summary: result.summary } : {}),
    });
    deps.log('turn_completed', {
      uid: p.uid,
      requestId: p.requestId,
      channel: p.channel,
      move: t.plan.primary,
      stage: t.analysis.stage,
      risk: t.analysis.risk,
      analysisSource: t.analysisSource,
      ...(t.analysisError ? { analysisError: t.analysisError } : {}),
      guardIssues: t.guardIssues.map((i) => i.check),
      regenerated: t.regenerated,
      model: t.models.reply,
      thinking: p.thinking ?? THINKING.default,
      latencyMs: t.latencyMs,
      tokens: { ...t.tokens, voice: p.extraTokens ?? 0, total: tokens },
      summarised: Boolean(result.summary),
      memory: result.memory ? Object.keys(result.memory) : [],
    });
    if (result.memory) await updateCoachMemory(deps, { uid: p.uid, requestId: p.requestId, conversationId: p.conversationId, delta: result.memory });
    return { result, usage, reply: turn.reply ?? result.reply, replyCreatedAtMs: turn.replyCreatedAtMs ?? deps.now(), proposal: turn.proposal };
  } catch (error) {
    await failTurn(deps.db, { uid: p.uid, requestId: p.requestId, attempt: p.attempt, nowMs: deps.now() }).catch(() => undefined);
    deps.log('turn_failed', { uid: p.uid, requestId: p.requestId, channel: p.channel, stage: 'complete' });
    throw new CoachError('internal', { refunded: true });
  }
}

export async function handleCoachTurn(deps: TurnDeps, ctx: CallContext, data: unknown): Promise<CoachTurnResponse> {
  const uid = requireUid(ctx);
  const req = parseCoachTurnRequest(data);
  const nowMs = deps.now();
  const begin = await beginTurn(deps.db, {
    uid,
    requestId: req.requestId,
    conversationId: req.conversationId,
    channel: 'text',
    metered: req.kind === 'message',
    inputHash: sha256(req.kind === 'message' ? `text\n${req.text}` : 'opener'),
    ...(req.kind === 'message' ? { userText: req.text } : {}),
    ...(req.reflectionCheckInId ? { reflectionCheckInId: req.reflectionCheckInId } : {}),
    nowMs,
  });

  if (begin.kind === 'replay') {
    deps.log('turn_replayed', { uid, requestId: req.requestId, channel: 'text' });
    return response({
      requestId: req.requestId,
      conversationId: req.conversationId,
      reply: begin.turn.reply ?? '',
      replyCreatedAtMs: begin.turn.replyCreatedAtMs ?? nowMs,
      ...(req.kind === 'message' ? { userText: req.text, userCreatedAtMs: begin.turn.userCreatedAtMs ?? nowMs } : {}),
      usage: begin.usage,
      metered: false,
      replayed: true,
      proposal: begin.turn.proposal,
    });
  }

  const text = req.kind === 'message' ? req.text! : openerPrompt(begin.conversation.mode);
  const run = await runTurn(deps, {
    uid,
    requestId: req.requestId,
    conversationId: req.conversationId,
    attempt: begin.attempt,
    channel: 'text',
    conversation: begin.conversation,
    text,
    ...(req.thinking ? { thinking: req.thinking } : {}),
  });
  return response({
    requestId: req.requestId,
    conversationId: req.conversationId,
    reply: run.reply,
    replyCreatedAtMs: run.replyCreatedAtMs,
    ...(req.kind === 'message' ? { userText: req.text, userCreatedAtMs: begin.userCreatedAtMs ?? nowMs } : {}),
    usage: run.usage,
    metered: begin.metered,
    replayed: false,
    proposal: run.proposal,
  });
}

/** What the engine sees for a session the coach opens, so it greets rather than answering a message. */
function openerPrompt(mode: ConversationState['mode']): string {
  return mode === 'reflection'
    ? '(The user opened a reflection on their recent check-ins and is waiting for you to start.)'
    : '(The user opened a new coaching session and is waiting for you to start.)';
}

/**
 * Speaks one part of a reply. A failure only loses the audio: the reply is already
 * delivered as text. Tokens are added to the day's allowance when `meter` is set.
 */
async function speakPart(
  deps: TurnDeps,
  p: { uid: string; requestId: string; text: string; meter: boolean; voice: CoachVoice },
): Promise<ReplyAudio | null> {
  if (!p.text) return null;
  try {
    const audio = await deps.voice().synthesize(p.text, p.voice);
    if (p.meter) await addTokens(deps.db, p.uid, audio.tokens, deps.now()).catch(() => undefined);
    return { base64: audio.data.toString('base64'), mimeType: audio.mimeType };
  } catch {
    deps.log('tts_failed', { uid: p.uid, requestId: p.requestId });
    return null;
  }
}

/** The first spoken part; the app fetches the others with voiceAudio while it plays. */
async function firstAudio(
  deps: TurnDeps,
  p: { uid: string; requestId: string; reply: string; wanted: boolean; meter: boolean; voice: CoachVoice },
) {
  const parts = voiceParts(p.reply);
  if (!p.wanted || parts.length === 0) return { replyAudio: null, audioParts: 0 };
  const replyAudio = await speakPart(deps, { uid: p.uid, requestId: p.requestId, text: parts[0]!, meter: p.meter, voice: p.voice });
  return { replyAudio, audioParts: replyAudio ? parts.length : 0 };
}

export async function handleVoiceTurn(deps: TurnDeps, ctx: CallContext, data: unknown): Promise<VoiceTurnResponse> {
  const uid = requireUid(ctx);
  const req = parseVoiceTurnRequest(data);
  const nowMs = deps.now();
  const begin = await beginTurn(deps.db, {
    uid,
    requestId: req.requestId,
    conversationId: req.conversationId,
    channel: 'voice',
    metered: true,
    inputHash: sha256(req.audioBytes),
    ...(req.reflectionCheckInId ? { reflectionCheckInId: req.reflectionCheckInId } : {}),
    nowMs,
  });

  if (begin.kind === 'replay') {
    const reply = begin.turn.reply ?? '';
    const transcript = begin.turn.transcript ?? '';
    deps.log('turn_replayed', { uid, requestId: req.requestId, channel: 'voice' });
    return {
      ...response({
        requestId: req.requestId,
        conversationId: req.conversationId,
        reply,
        replyCreatedAtMs: begin.turn.replyCreatedAtMs ?? nowMs,
        ...(transcript ? { userText: transcript, userCreatedAtMs: begin.turn.userCreatedAtMs ?? nowMs } : {}),
        usage: begin.usage,
        metered: false,
        replayed: true,
        proposal: begin.turn.proposal,
      }),
      transcript,
      // Replays are free, including their audio.
      ...(await firstAudio(deps, { uid, requestId: req.requestId, reply, wanted: req.wantAudio !== false, meter: false, voice: req.voice ?? DEFAULT_VOICE })),
    };
  }

  let transcript: string;
  let sttTokens = 0;
  try {
    const result = await deps.voice().transcribe(req.audioBytes, req.audio.mimeType);
    transcript = result.text.trim();
    sttTokens = result.tokens;
  } catch {
    await failTurn(deps.db, { uid, requestId: req.requestId, attempt: begin.attempt, nowMs: deps.now() });
    deps.log('turn_failed', { uid, requestId: req.requestId, channel: 'voice', stage: 'stt' });
    throw new CoachError('provider-unavailable', { refunded: true });
  }
  if (!transcript) {
    await failTurn(deps.db, { uid, requestId: req.requestId, attempt: begin.attempt, nowMs: deps.now() });
    throw new CoachError('no-speech', { refunded: true });
  }
  transcript = transcript.slice(0, 4000);
  const spokenAt = deps.now();
  await recordVoiceUserMessage(deps.db, { uid, requestId: req.requestId, conversationId: req.conversationId, transcript, nowMs: spokenAt });

  const run = await runTurn(deps, {
    uid,
    requestId: req.requestId,
    conversationId: req.conversationId,
    attempt: begin.attempt,
    channel: 'voice',
    conversation: begin.conversation,
    text: transcript,
    extraTokens: sttTokens,
    ...(req.thinking ? { thinking: req.thinking } : {}),
  });
  const audio = await firstAudio(deps, {
    uid,
    requestId: req.requestId,
    reply: run.reply,
    wanted: req.wantAudio !== false,
    meter: true,
    voice: req.voice ?? DEFAULT_VOICE,
  });
  return {
    ...response({
      requestId: req.requestId,
      conversationId: req.conversationId,
      reply: run.reply,
      replyCreatedAtMs: run.replyCreatedAtMs,
      userText: transcript,
      userCreatedAtMs: spokenAt,
      usage: run.usage,
      metered: true,
      replayed: false,
      proposal: run.proposal,
    }),
    transcript,
    ...audio,
  };
}

/**
 * A later part of a finished voice turn's spoken reply. The text comes from the stored
 * turn, never from the app, so this can't be used as a general text-to-speech service.
 */
export async function handleVoiceAudio(deps: TurnDeps, ctx: CallContext, data: unknown): Promise<VoiceAudioResponse> {
  const uid = requireUid(ctx);
  const req = parseVoiceAudioRequest(data);
  const turnRef = refs(deps.db, uid).turn(req.requestId);
  const key = String(req.part);
  const turn = await deps.db.runTransaction(async (tx) => {
    const snap = await tx.get(turnRef);
    const t = snap.data() as (TurnRecord & { audioFetches?: Record<string, number> }) | undefined;
    if (!t || t.status !== 'completed' || t.channel !== 'voice' || !t.reply) throw new CoachError('invalid-request');
    if ((t.audioFetches?.[key] ?? 0) >= MAX_PART_FETCHES) throw new CoachError('invalid-request');
    tx.update(turnRef, { [`audioFetches.${key}`]: FieldValue.increment(1) });
    return t;
  });
  const text = voiceParts(turn.reply ?? '')[req.part];
  if (!text) throw new CoachError('invalid-request');
  const replyAudio = await speakPart(deps, { uid, requestId: req.requestId, text, meter: turn.metered, voice: req.voice ?? DEFAULT_VOICE });
  return { requestId: req.requestId, part: req.part, replyAudio };
}

/** What every voice says when previewed. Fixed, so each instance makes each sample once. */
export const PREVIEW_TEXT = "Hi, I'm your coach. Take your time — I'm here whenever you want to talk something through.";
const previews = new Map<CoachVoice, Promise<ReplyAudio | null>>();

/** A sample of one voice for the picker. Not metered: it's the same few seconds for everyone. */
export async function handleVoicePreview(deps: TurnDeps, ctx: CallContext, data: unknown): Promise<VoicePreviewResponse> {
  const uid = requireUid(ctx);
  const { voice } = parseVoicePreviewRequest(data);
  let sample = previews.get(voice);
  if (!sample) {
    sample = speakPart(deps, { uid, requestId: `preview_${voice}`, text: PREVIEW_TEXT, meter: false, voice });
    previews.set(voice, sample);
  }
  const replyAudio = await sample;
  // A failure is tried again next time rather than remembered.
  if (!replyAudio) previews.delete(voice);
  return { voice, replyAudio };
}

export async function handleGetAccount(
  deps: Pick<TurnDeps, 'db' | 'now' | 'log'>,
  ctx: CallContext,
  data?: unknown,
): Promise<AccountResponse> {
  const uid = requireUid(ctx);
  const nowMs = deps.now();
  const account = await getOrCreateAccount(deps.db, uid, nowMs);
  // A prototype account is copied into the v2 collections once. A failure is retried
  // on the next call and never blocks the account.
  const timeZone = (data as { timeZone?: unknown } | null | undefined)?.timeZone;
  let legacyImported = false;
  try {
    const result = await importLegacyAccount(deps.db, uid, { timeZone, nowMs });
    legacyImported = true;
    if (result.status === 'imported') deps.log('legacy_imported', { uid, created: result.created, skipped: result.skipped });
  } catch (error) {
    deps.log('legacy_import_failed', { uid, name: (error as Error)?.name });
  }
  return { plan: account.plan, usage: usageOf(account, nowMs), legacyImported };
}
