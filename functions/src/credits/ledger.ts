import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';

import { DEFAULT_PLAN, LIMITS, MONTHLY_ALLOWANCE } from '../config.js';
import {
  userMessageId,
  coachMessageId,
  type Channel,
  type ConversationMode,
  type GoalProgressProposal,
  type Plan,
} from '../contract.js';
import { CoachError } from '../errors.js';
import { checkRateLimit, nextPeriodStart, periodKey } from './period.js';

export type AccountData = {
  plan: Plan;
  betaTier: boolean;
  creditsRemaining: number;
  creditsPeriodKey: string;
  monthlyAllowance: number;
};

export type TurnStatus = 'pending' | 'completed' | 'failed';

export type TurnRecord = {
  status: TurnStatus;
  creditCharged: boolean;
  channel: Channel;
  conversationId: string;
  inputHash: string;
  periodKey: string;
  attempt: number;
  leaseUntilMs: number;
  reply?: string;
  transcript?: string;
  proposal?: GoalProgressProposal | null;
  userCreatedAtMs?: number;
  replyCreatedAtMs?: number;
};

export type ConversationState = {
  mode: ConversationMode;
  reflectionCheckInId?: string;
  summary?: string;
  summaryMessageCount: number;
};

export type BeginTurnParams = {
  uid: string;
  requestId: string;
  conversationId: string;
  channel: Channel;
  /** False for session openers: the coach speaks first and nothing is charged. */
  charge: boolean;
  /** Hash of the request payload; the same requestId must always carry the same input. */
  inputHash: string;
  /** Text turns write the user message in the charge transaction; voice writes it after STT. */
  userText?: string;
  reflectionCheckInId?: string;
  nowMs: number;
};

export type BeginTurnResult =
  | { kind: 'replay'; turn: TurnRecord; creditsRemaining: number; periodKey: string }
  | {
      kind: 'run';
      attempt: number;
      creditsRemaining: number;
      periodKey: string;
      conversation: ConversationState;
      tookOver: boolean;
      /** True only when this call decremented the balance. */
      charged: boolean;
      userCreatedAtMs?: number;
    };

export const refs = (db: Firestore, uid: string) => {
  const user = db.collection('users').doc(uid);
  return {
    user,
    account: user.collection('private').doc('account'),
    rateLimit: user.collection('private').doc('rateLimit'),
    turn: (id: string) => user.collection('turns').doc(id),
    conversation: (id: string) => user.collection('conversations').doc(id),
    message: (cid: string, mid: string) => user.collection('conversations').doc(cid).collection('messages').doc(mid),
  };
};

/** Creates the account on first use and applies the lazy monthly reset. */
export function resolveAccount(existing: Partial<AccountData> | undefined, nowMs: number): { account: AccountData; changed: boolean } {
  const key = periodKey(nowMs);
  const plan: Plan = existing?.plan === 'plus' ? 'plus' : DEFAULT_PLAN;
  const allowance = MONTHLY_ALLOWANCE[plan];
  if (!existing || typeof existing.creditsRemaining !== 'number' || existing.creditsPeriodKey !== key) {
    return {
      account: { plan, betaTier: existing?.betaTier ?? true, creditsRemaining: allowance, creditsPeriodKey: key, monthlyAllowance: allowance },
      changed: true,
    };
  }
  const account: AccountData = {
    plan,
    betaTier: existing.betaTier ?? true,
    creditsRemaining: existing.creditsRemaining,
    creditsPeriodKey: key,
    monthlyAllowance: allowance,
  };
  return { account, changed: existing.monthlyAllowance !== allowance };
}

export function preview(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length <= LIMITS.previewChars ? oneLine : `${oneLine.slice(0, LIMITS.previewChars - 1).trimEnd()}…`;
}

function resetsAtIso(nowMs: number): string {
  return new Date(nextPeriodStart(nowMs)).toISOString();
}

export async function getOrCreateAccount(db: Firestore, uid: string, nowMs: number): Promise<AccountData> {
  const r = refs(db, uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(r.account);
    const { account, changed } = resolveAccount(snap.data() as Partial<AccountData> | undefined, nowMs);
    if (changed) tx.set(r.account, { ...account, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return account;
  });
}

/**
 * Atomically: idempotency check, monthly reset, rate limit, credit deduction and the user
 * message. The conversation is created by the app; a missing one is rejected before any
 * charge. Nothing is charged when this throws.
 */
export async function beginTurn(db: Firestore, p: BeginTurnParams): Promise<BeginTurnResult> {
  const r = refs(db, p.uid);
  const turnRef = r.turn(p.requestId);
  const convRef = r.conversation(p.conversationId);
  const userMsgRef = r.message(p.conversationId, userMessageId(p.requestId));
  const checkInRef = p.reflectionCheckInId ? r.user.collection('checkIns').doc(p.reflectionCheckInId) : null;

  return db.runTransaction(async (tx) => {
    const reads = [tx.get(turnRef), tx.get(r.account), tx.get(r.rateLimit), tx.get(convRef), tx.get(userMsgRef)];
    if (checkInRef) reads.push(tx.get(checkInRef));
    const [turnSnap, accountSnap, rateSnap, convSnap, userMsgSnap, checkInSnap] = await Promise.all(reads);

    if (!convSnap!.exists) throw new CoachError('conversation-not-found');
    if (checkInRef && !checkInSnap!.exists) throw new CoachError('check-in-not-found');

    const { account, changed: accountChanged } = resolveAccount(accountSnap!.data() as Partial<AccountData> | undefined, p.nowMs);
    const existing = turnSnap!.exists ? (turnSnap!.data() as TurnRecord) : undefined;

    if (existing) {
      if (existing.inputHash !== p.inputHash || existing.conversationId !== p.conversationId) {
        throw new CoachError('invalid-request');
      }
      if (existing.status === 'completed') {
        if (accountChanged) tx.set(r.account, { ...account, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return { kind: 'replay', turn: existing, creditsRemaining: account.creditsRemaining, periodKey: account.creditsPeriodKey } as const;
      }
      if (existing.status === 'pending' && existing.leaseUntilMs > p.nowMs) {
        throw new CoachError('in-progress', { retryAfterSeconds: 2 });
      }
    }

    // An expired pending turn that was already charged is taken over without charging again.
    const takeOver = Boolean(existing?.status === 'pending' && existing.creditCharged && existing.periodKey === account.creditsPeriodKey);
    const chargeNow = p.charge && !takeOver;
    let creditsRemaining = account.creditsRemaining;

    const recent = ((rateSnap!.data()?.recent as number[] | undefined) ?? []).filter((t) => typeof t === 'number');
    const rate = checkRateLimit(recent, p.nowMs);
    if (!takeOver && !rate.ok) {
      throw new CoachError('rate-limited', { retryAfterSeconds: Math.max(1, Math.ceil(rate.retryAfterMs / 1000)) });
    }
    if (chargeNow && account.creditsRemaining <= 0) {
      throw new CoachError('no-credits', { remaining: 0, resetsAt: resetsAtIso(p.nowMs) });
    }
    if (chargeNow) {
      creditsRemaining = account.creditsRemaining - 1;
      tx.set(r.account, { ...account, creditsRemaining, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    } else if (accountChanged) {
      tx.set(r.account, { ...account, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    if (!takeOver && rate.ok) tx.set(r.rateLimit, { recent: rate.recent, updatedAt: FieldValue.serverTimestamp() });

    const attempt = (existing?.attempt ?? 0) + 1;
    const userCreatedAtMs = p.userText !== undefined ? p.nowMs : existing?.userCreatedAtMs;
    const turn: TurnRecord = {
      status: 'pending',
      creditCharged: chargeNow || takeOver,
      channel: p.channel,
      conversationId: p.conversationId,
      inputHash: p.inputHash,
      periodKey: account.creditsPeriodKey,
      attempt,
      leaseUntilMs: p.nowMs + LIMITS.turnLeaseMs,
      ...(userCreatedAtMs !== undefined ? { userCreatedAtMs } : {}),
    };
    tx.set(turnRef, {
      ...turn,
      updatedAt: FieldValue.serverTimestamp(),
      ...(existing ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });

    const c = convSnap!.data()!;
    const conversation: ConversationState = {
      mode: c.mode === 'reflection' ? 'reflection' : 'normal',
      ...(typeof c.reflectionCheckInId === 'string' ? { reflectionCheckInId: c.reflectionCheckInId } : {}),
      ...(typeof c.summary === 'string' ? { summary: c.summary } : {}),
      summaryMessageCount: typeof c.summaryMessageCount === 'number' ? c.summaryMessageCount : 0,
    };

    if (p.userText !== undefined && !userMsgSnap!.exists) {
      tx.set(userMsgRef, {
        role: 'user',
        text: p.userText,
        clientTurnId: p.requestId,
        channel: p.channel,
        createdAt: Timestamp.fromMillis(p.nowMs),
      });
      tx.set(convRef, {
        messageCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
        lastMessageAt: Timestamp.fromMillis(p.nowMs),
        lastMessagePreview: preview(p.userText),
      }, { merge: true });
    }

    return {
      kind: 'run',
      attempt,
      creditsRemaining,
      periodKey: account.creditsPeriodKey,
      conversation,
      tookOver: takeOver,
      charged: chargeNow,
      ...(userCreatedAtMs !== undefined ? { userCreatedAtMs } : {}),
    } as const;
  });
}

/** Voice turns: the transcript becomes the user message once STT has produced it. */
export async function recordVoiceUserMessage(
  db: Firestore,
  p: { uid: string; conversationId: string; requestId: string; transcript: string; nowMs: number },
): Promise<void> {
  const r = refs(db, p.uid);
  const msgRef = r.message(p.conversationId, userMessageId(p.requestId));
  const convRef = r.conversation(p.conversationId);
  await db.runTransaction(async (tx) => {
    const msg = await tx.get(msgRef);
    tx.set(r.turn(p.requestId), { transcript: p.transcript, userCreatedAtMs: p.nowMs }, { merge: true });
    if (msg.exists) return;
    tx.set(msgRef, {
      role: 'user',
      text: p.transcript,
      clientTurnId: p.requestId,
      channel: 'voice',
      createdAt: Timestamp.fromMillis(p.nowMs),
    });
    tx.set(convRef, {
      messageCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
      lastMessageAt: Timestamp.fromMillis(p.nowMs),
      lastMessagePreview: preview(p.transcript),
    }, { merge: true });
  });
}

export type CompleteTurnParams = {
  uid: string;
  requestId: string;
  conversationId: string;
  channel: Channel;
  reply: string;
  nowMs: number;
  proposal?: GoalProgressProposal;
  summary?: { text: string; messageCount: number };
};

/** Writes the coach message and marks the turn completed. The first writer wins. */
export async function completeTurn(
  db: Firestore,
  p: CompleteTurnParams,
): Promise<{ turn: TurnRecord; creditsRemaining: number; periodKey: string }> {
  const r = refs(db, p.uid);
  const turnRef = r.turn(p.requestId);
  const convRef = r.conversation(p.conversationId);
  return db.runTransaction(async (tx) => {
    const [turnSnap, accountSnap] = await Promise.all([tx.get(turnRef), tx.get(r.account)]);
    const creditsRemaining = (accountSnap.data()?.creditsRemaining as number | undefined) ?? 0;
    const storedPeriod = (accountSnap.data()?.creditsPeriodKey as string | undefined) ?? periodKey(p.nowMs);
    const turn = turnSnap.data() as TurnRecord | undefined;
    if (!turn) throw new CoachError('internal');
    if (turn.status === 'completed') return { turn, creditsRemaining, periodKey: storedPeriod };

    const replyCreatedAtMs = Math.max(p.nowMs, (turn.userCreatedAtMs ?? 0) + 1);
    const completed: TurnRecord = {
      ...turn,
      status: 'completed',
      reply: p.reply,
      proposal: p.proposal ?? null,
      leaseUntilMs: 0,
      replyCreatedAtMs,
    };
    tx.set(turnRef, { ...completed, updatedAt: FieldValue.serverTimestamp(), completedAt: Timestamp.fromMillis(replyCreatedAtMs) });
    tx.set(r.message(p.conversationId, coachMessageId(p.requestId)), {
      role: 'coach',
      text: p.reply,
      clientTurnId: p.requestId,
      channel: p.channel,
      createdAt: Timestamp.fromMillis(replyCreatedAtMs),
    });
    tx.set(convRef, {
      messageCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
      lastMessageAt: Timestamp.fromMillis(replyCreatedAtMs),
      lastMessagePreview: preview(p.reply),
      ...(p.summary ? { summary: p.summary.text, summaryMessageCount: p.summary.messageCount } : {}),
    }, { merge: true });
    return { turn: completed, creditsRemaining, periodKey: storedPeriod };
  });
}

/** Marks a running turn failed and refunds its credit (only once, only for the current attempt). */
export async function failTurn(db: Firestore, p: { uid: string; requestId: string; attempt: number }): Promise<number> {
  const r = refs(db, p.uid);
  const turnRef = r.turn(p.requestId);
  return db.runTransaction(async (tx) => {
    const [turnSnap, accountSnap] = await Promise.all([tx.get(turnRef), tx.get(r.account)]);
    const turn = turnSnap.data() as TurnRecord | undefined;
    let credits = (accountSnap.data()?.creditsRemaining as number | undefined) ?? 0;
    if (!turn || turn.status !== 'pending' || turn.attempt !== p.attempt) return credits;
    if (turn.creditCharged && accountSnap.data()?.creditsPeriodKey === turn.periodKey) {
      credits += 1;
      tx.update(r.account, { creditsRemaining: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
    }
    tx.update(turnRef, { status: 'failed', creditCharged: false, leaseUntilMs: 0, updatedAt: FieldValue.serverTimestamp() });
    return credits;
  });
}