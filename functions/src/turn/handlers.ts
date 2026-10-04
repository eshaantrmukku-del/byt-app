import { createHash } from 'node:crypto';

import type { Firestore } from 'firebase-admin/firestore';

import { MONTHLY_ALLOWANCE } from '../config.js';
import {
  coachMessageId,
  userMessageId,
  type AccountResponse,
  type Channel,
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

function baseResponse(p: {
  clientTurnId: string;
  conversationId: string;
  reply: string;
  creditsRemaining: number;
  replayed: boolean;
  proposal?: CoachTurnResponse['proposal'] | null;
}): CoachTurnResponse {
  return {
    ok: true,
    clientTurnId: p.clientTurnId,
    conversationId: p.conversationId,
    userMessageId: userMessageId(p.clientTurnId),
    coachMessageId: coachMessageId(p.clientTurnId),
    reply: p.reply,
    creditsRemaining: p.creditsRemaining,
    replayed: p.replayed,
    ...(p.proposal ? { proposal: p.proposal } : {}),
  };
}

/**
 * Runs the engine for a charged turn and records the outcome. Any failure before the
 * coach message is stored refunds the credit and surfaces as a retryable error.
 */
async function runChargedTurn(
  deps: TurnDeps,
  p: { uid: string; clientTurnId: string; conversationId: string; attempt: number; channel: Channel; conversation: ConversationState; text: string },
): Promise<{ result: EngineResult; creditsRemaining: number; reply: string; proposal?: CoachTurnResponse['proposal'] | null }> {
  const started = deps.now();
  let result: EngineResult;
  try {
    const llm = deps.llm();
    const context = await loadCoachContext(deps.db, { ...p, nowMs: started });
    result = await runCoachingEngine(llm, { text: p.text, channel: p.channel, context }, deps.engineOptions);
  } catch (error) {
    const creditsRemaining = await failTurn(deps.db, { uid: p.uid, clientTurnId: p.clientTurnId, attempt: p.attempt });
    const reason = error instanceof CoachError ? error.reason : 'ai-unavailable';
    deps.log('turn_failed', { uid: p.uid, clientTurnId: p.clientTurnId, channel: p.channel, stage: 'engine', reason, errorKind: (error as { kind?: string }).kind ?? (error as Error).name });
    throw new CoachError(reason === 'not-configured' ? 'not-configured' : 'ai-unavailable', { creditsRemaining });
  }

  try {
    const { turn, creditsRemaining } = await completeTurn(deps.db, {
      uid: p.uid,
      clientTurnId: p.clientTurnId,
      conversationId: p.conversationId,
      channel: p.channel,
      reply: result.reply,
      ...(result.proposal ? { proposal: result.proposal } : {}),
      ...(result.summary ? { summary: result.summary } : {}),
    });
    const t = result.trace;
    deps.log('turn_completed', {
      uid: p.uid,
      clientTurnId: p.clientTurnId,
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
    return { result, creditsRemaining, reply: turn.reply ?? result.reply, proposal: turn.proposal };
  } catch (error) {
    const creditsRemaining = await failTurn(deps.db, { uid: p.uid, clientTurnId: p.clientTurnId, attempt: p.attempt }).catch(() => undefined);
    deps.log('turn_failed', { uid: p.uid, clientTurnId: p.clientTurnId, channel: p.channel, stage: 'complete' });
    throw new CoachError('internal', creditsRemaining === undefined ? {} : { creditsRemaining });
  }
}

export async function handleCoachTurn(deps: TurnDeps, ctx: CallContext, data: unknown): Promise<CoachTurnResponse> {
  const uid = requireUid(ctx);
  const req = parseCoachTurnRequest(data);
  const begin = await beginTurn(deps.db, {
    uid,
    clientTurnId: req.clientTurnId,
    conversationId: req.conversationId,
    channel: 'text',
    inputHash: sha256(`text\n${req.text}`),
    userText: req.text,
    ...(req.mode ? { mode: req.mode } : {}),
    ...(req.reflectionCheckInId ? { reflectionCheckInId: req.reflectionCheckInId } : {}),
    nowMs: deps.now(),
  });

  if (begin.kind === 'replay') {
    deps.log('turn_replayed', { uid, clientTurnId: req.clientTurnId, channel: 'text' });
    return baseResponse({ ...req, reply: begin.turn.reply ?? '', creditsRemaining: begin.creditsRemaining, replayed: true, proposal: begin.turn.proposal });
  }

  const run = await runChargedTurn(deps, { uid, ...req, attempt: begin.attempt, channel: 'text', conversation: begin.conversation });
  return baseResponse({ ...req, reply: run.reply, creditsRemaining: run.creditsRemaining, replayed: false, proposal: run.proposal });
}

async function speak(deps: TurnDeps, uid: string, clientTurnId: string, text: string, wanted: boolean) {
  if (!wanted) return { audioBase64: null, audioMimeType: null } as const;
  try {
    const audio = await deps.voice().synthesize(text);
    return { audioBase64: audio.toString('base64'), audioMimeType: 'audio/mpeg' } as const;
  } catch {
    // The coaching reply is already delivered as text; losing the audio isn't worth failing the turn.
    deps.log('tts_failed', { uid, clientTurnId });
    return { audioBase64: null, audioMimeType: null } as const;
  }
}

export async function handleVoiceTurn(deps: TurnDeps, ctx: CallContext, data: unknown): Promise<VoiceTurnResponse> {
  const uid = requireUid(ctx);
  const req = parseVoiceTurnRequest(data);
  const ids = { clientTurnId: req.clientTurnId, conversationId: req.conversationId };
  const begin = await beginTurn(deps.db, {
    uid,
    ...ids,
    channel: 'voice',
    inputHash: sha256(req.audio),
    ...(req.mode ? { mode: req.mode } : {}),
    ...(req.reflectionCheckInId ? { reflectionCheckInId: req.reflectionCheckInId } : {}),
    nowMs: deps.now(),
  });

  if (begin.kind === 'replay') {
    const reply = begin.turn.reply ?? '';
    deps.log('turn_replayed', { uid, clientTurnId: req.clientTurnId, channel: 'voice' });
    return {
      ...baseResponse({ ...ids, reply, creditsRemaining: begin.creditsRemaining, replayed: true, proposal: begin.turn.proposal }),
      transcript: begin.turn.transcript ?? '',
      ...(await speak(deps, uid, req.clientTurnId, reply, req.wantAudio !== false)),
    };
  }

  let transcript: string;
  try {
    transcript = (await deps.voice().transcribe(req.audio, req.mimeType)).trim();
  } catch {
    const creditsRemaining = await failTurn(deps.db, { uid, clientTurnId: req.clientTurnId, attempt: begin.attempt });
    deps.log('turn_failed', { uid, clientTurnId: req.clientTurnId, channel: 'voice', stage: 'stt' });
    throw new CoachError('ai-unavailable', { creditsRemaining });
  }
  if (!transcript) {
    const creditsRemaining = await failTurn(deps.db, { uid, clientTurnId: req.clientTurnId, attempt: begin.attempt });
    throw new CoachError('no-speech', { creditsRemaining });
  }
  transcript = transcript.slice(0, 4000);
  await recordVoiceUserMessage(deps.db, { uid, ...ids, transcript });

  const run = await runChargedTurn(deps, { uid, ...ids, attempt: begin.attempt, channel: 'voice', conversation: begin.conversation, text: transcript });
  return {
    ...baseResponse({ ...ids, reply: run.reply, creditsRemaining: run.creditsRemaining, replayed: false, proposal: run.proposal }),
    transcript,
    ...(await speak(deps, uid, req.clientTurnId, run.reply, req.wantAudio !== false)),
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
