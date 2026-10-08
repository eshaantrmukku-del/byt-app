import { createHash } from 'node:crypto';

import type { Firestore } from 'firebase-admin/firestore';

import { MONTHLY_ALLOWANCE } from '../config.js';
import {
  coachMessageId,
  userMessageId,
  type AccountResponse,
  type Channel,
  type CoachMessagePayload,
  type CoachTurnResponse,
  type VoiceTurnResponse,
} from '../contract.js';
import { beginTurn, completeTurn, failTurn, getOrCreateAccount, recordVoiceUserMessage, type ConversationState } from '../credits/ledger.js';
import { nextPeriodStart } from '../credits/period.js';
import { runCoachingEngine, type EngineOptions } from '../engine/engine.js';
import type { EngineResult } from '../engine/types.js';
import { CoachError } from '../errors.js';
import type { LlmClient } from '../llm/types.js';
import { parseCoachTurnRequest, parseVoiceTurnRequest } from '../validation.js';
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
  creditsRemaining: number;
  periodKey: string;
  charged: 0 | 1;
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
    credits: { remaining: p.creditsRemaining, periodKey: p.periodKey, charged: p.charged },
    ...(p.proposal ? { proposal: p.proposal } : {}),
  };
}

/**
 * Runs the engine for a charged turn and records the outcome. Any failure before the
 * coach message is stored refunds the credit and surfaces as a retryable error.
 */
async function runChargedTurn(
  deps: TurnDeps,
  p: { uid: string; requestId: string; conversationId: string; attempt: number; channel: Channel; conversation: ConversationState; text: string },
): Promise<{ result: EngineResult; creditsRemaining: number; periodKey: string; reply: string; replyCreatedAtMs: number; proposal?: CoachTurnResponse['proposal'] | null }> {
  const started = deps.now();
  let result: EngineResult;
  try {
    const llm = deps.llm();
    const context = await loadCoachContext(deps.db, { uid: p.uid, conversationId: p.conversationId, clientTurnId: p.requestId, conversation: p.conversation, nowMs: started });
    result = await runCoachingEngine(llm, { text: p.text, channel: p.channel, context }, deps.engineOptions);
  } catch (error) {
    const creditsRemaining = await failTurn(deps.db, { uid: p.uid, requestId: p.requestId, attempt: p.attempt });
    const reason = error instanceof CoachError ? error.reason : 'provider-unavailable';
    deps.log('turn_failed', { uid: p.uid, requestId: p.requestId, channel: p.channel, stage: 'engine', reason, errorKind: (error as { kind?: string }).kind ?? (error as Error).name });
    throw new CoachError(reason === 'not-configured' ? 'not-configured' : 'provider-unavailable', { refunded: true, remaining: creditsRemaining });
  }

  try {
    const { turn, creditsRemaining, periodKey } = await completeTurn(deps.db, {
      uid: p.uid,
      requestId: p.requestId,
      conversationId: p.conversationId,
      channel: p.channel,
      reply: result.reply,
      nowMs: deps.now(),
      ...(result.proposal ? { proposal: result.proposal } : {}),
      ...(result.summary ? { summary: result.summary } : {}),
    });
    const t = result.trace;
    deps.log('turn_completed', {
      uid: p.uid,
      requestId: p.requestId,
      channel: p.channel,
      move: t.plan.primary,
      stage: t.analysis.stage,
      risk: t.analysis.risk,
      analysisSource: t.analysisSource,
      guardIssues: t.guardIssues.map((i) => i.check),
      regenerated: t.regenerated,
      model: t.models.reply,
      latencyMs: t.latencyMs,
      tokens: t.tokens,
      summarised: Boolean(result.summary),
    });
    return { result, creditsRemaining, periodKey, reply: turn.reply ?? result.reply, replyCreatedAtMs: turn.replyCreatedAtMs ?? deps.now(), proposal: turn.proposal };
  } catch (error) {
    const creditsRemaining = await failTurn(deps.db, { uid: p.uid, requestId: p.requestId, attempt: p.attempt }).catch(() => undefined);
    deps.log('turn_failed', { uid: p.uid, requestId: p.requestId, channel: p.channel, stage: 'complete' });
    throw new CoachError('internal', creditsRemaining === undefined ? { refunded: true } : { refunded: true, remaining: creditsRemaining });
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
    charge: req.kind === 'message',
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
      creditsRemaining: begin.creditsRemaining,
      periodKey: begin.periodKey,
      charged: 0,
      replayed: true,
      proposal: begin.turn.proposal,
    });
  }

  const text = req.kind === 'message' ? req.text! : openerPrompt(begin.conversation.mode);
  const run = await runChargedTurn(deps, {
    uid,
    requestId: req.requestId,
    conversationId: req.conversationId,
    attempt: begin.attempt,
    channel: 'text',
    conversation: begin.conversation,
    text,
  });
  return response({
    requestId: req.requestId,
    conversationId: req.conversationId,
    reply: run.reply,
    replyCreatedAtMs: run.replyCreatedAtMs,
    ...(req.kind === 'message' ? { userText: req.text, userCreatedAtMs: begin.userCreatedAtMs ?? nowMs } : {}),
    creditsRemaining: run.creditsRemaining,
    periodKey: run.periodKey,
    charged: begin.charged ? 1 : 0,
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

async function speak(deps: TurnDeps, uid: string, requestId: string, text: string, wanted: boolean) {
  if (!wanted) return { replyAudio: null } as const;
  try {
    const audio = await deps.voice().synthesize(text);
    return { replyAudio: { base64: audio.toString('base64'), mimeType: 'audio/mpeg' as const } };
  } catch {
    // The reply is already delivered as text; losing the audio isn't worth failing the turn.
    deps.log('tts_failed', { uid, requestId });
    return { replyAudio: null } as const;
  }
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
    charge: true,
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
        creditsRemaining: begin.creditsRemaining,
        periodKey: begin.periodKey,
        charged: 0,
        replayed: true,
        proposal: begin.turn.proposal,
      }),
      transcript,
      ...(await speak(deps, uid, req.requestId, reply, req.wantAudio !== false)),
    };
  }

  let transcript: string;
  try {
    transcript = (await deps.voice().transcribe(req.audioBytes, req.audio.mimeType)).trim();
  } catch {
    const remaining = await failTurn(deps.db, { uid, requestId: req.requestId, attempt: begin.attempt });
    deps.log('turn_failed', { uid, requestId: req.requestId, channel: 'voice', stage: 'stt' });
    throw new CoachError('provider-unavailable', { refunded: true, remaining });
  }
  if (!transcript) {
    const remaining = await failTurn(deps.db, { uid, requestId: req.requestId, attempt: begin.attempt });
    throw new CoachError('no-speech', { refunded: true, remaining });
  }
  transcript = transcript.slice(0, 4000);
  const spokenAt = deps.now();
  await recordVoiceUserMessage(deps.db, { uid, requestId: req.requestId, conversationId: req.conversationId, transcript, nowMs: spokenAt });

  const run = await runChargedTurn(deps, {
    uid,
    requestId: req.requestId,
    conversationId: req.conversationId,
    attempt: begin.attempt,
    channel: 'voice',
    conversation: begin.conversation,
    text: transcript,
  });
  return {
    ...response({
      requestId: req.requestId,
      conversationId: req.conversationId,
      reply: run.reply,
      replyCreatedAtMs: run.replyCreatedAtMs,
      userText: transcript,
      userCreatedAtMs: spokenAt,
      creditsRemaining: run.creditsRemaining,
      periodKey: run.periodKey,
      charged: 1,
      replayed: false,
      proposal: run.proposal,
    }),
    transcript,
    ...(await speak(deps, uid, req.requestId, run.reply, req.wantAudio !== false)),
  };
}

export async function handleGetAccount(deps: Pick<TurnDeps, 'db' | 'now'>, ctx: CallContext): Promise<AccountResponse> {
  const uid = requireUid(ctx);
  const nowMs = deps.now();
  const account = await getOrCreateAccount(deps.db, uid, nowMs);
  return {
    plan: account.plan,
    creditsRemaining: account.creditsRemaining,
    monthlyAllowance: MONTHLY_ALLOWANCE[account.plan],
    creditsPeriodKey: account.creditsPeriodKey,
    resetsAt: nextPeriodStart(nowMs),
  };
}
