import { FieldValue, type Firestore } from 'firebase-admin/firestore';

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
import { checkRateLimit, periodKey } from './period.js';

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
};

export type ConversationState = {
  mode: ConversationMode;
  reflectionCheckInId?: string;
  summary?: string;
  summaryMessageCount: number;
};

export type BeginTurnParams = {
  uid: string;
  clientTurnId: string;
  conversationId: string;
  channel: Channel;
  /** Hash of the request payload; the same clientTurnId must always carry the same input. */
  inputHash: string;
  /** Text turns write the user message in the charge transaction; voice writes it after STT. */
  userText?: string;
  mode?: ConversationMode;
  reflectionCheckInId?: string;
  nowMs: number;
};

export type BeginTurnResult =
  | { kind: 'replay'; turn: TurnRecord; creditsRemaining: number }
  | { kind: 'run'; attempt: number; creditsRemaining: number; conversation: ConversationState; tookOver: boolean };

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

function conversationTitle(text: string | undefined, channel: Channel): string {
  if (!text) return channel === 'voice' ? 'Voice session' : 'New conversation';
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length <= 60 ? oneLine : `${oneLine.slice(0, 57).trimEnd()}…`;
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
 * Atomically: idempotency check, monthly reset, rate limit, credit deduction, turn lease,
 * conversation creation and (for text) the user message. Nothing is charged when this throws.
 */
export async function beginTurn(db: Firestore, p: BeginTurnParams): Promise<BeginTurnResult> {
  const r = refs(db, p.uid);
  const turnRef = r.turn(p.clientTurnId);
  const convRef = r.conversation(p.conversationId);
  const userMsgRef = r.message(p.conversationId, userMessageId(p.clientTurnId));

  return db.runTransaction(async (tx) => {
    const [turnSnap, accountSnap, rateSnap, convSnap, userMsgSnap] = await Promise.all([
      tx.get(turnRef),
      tx.get(r.account),
      tx.get(r.rateLimit),
      tx.get(convRef),
      tx.get(userMsgRef),
    ]);
    const { account, changed: accountChanged } = resolveAccount(accountSnap.data() as Partial<AccountData> | undefined, p.nowMs);
    const existing = turnSnap.exists ? (turnSnap.data() as TurnRecord) : undefined;

    if (existing) {
      if (existing.inputHash !== p.inputHash || existing.conversationId !== p.conversationId) {
        throw new CoachError('turn-id-reused');
      }
      if (existing.status === 'completed') {
        return { kind: 'replay', turn: existing, creditsRemaining: account.creditsRemaining } as const;
      }
      if (existing.status === 'pending' && existing.leaseUntilMs > p.nowMs) {
        throw new CoachError('turn-in-progress', { retryAfterMs: Math.min(existing.leaseUntilMs - p.nowMs, 5_000) });
      }
    }

    // An expired pending turn that was charged is taken over without charging again.
    const takeOver = existing?.status === 'pending' && existing.creditCharged && existing.periodKey === account.creditsPeriodKey;
    let creditsRemaining = account.creditsRemaining;

    if (!takeOver) {
      if (account.creditsRemaining <= 0) {
        throw new CoachError('no-credits', { creditsRemaining: 0 });
      }
      const recent = ((rateSnap.data()?.recent as number[] | undefined) ?? []).filter((t) => typeof t === 'number');
      const rate = checkRateLimit(recent, p.nowMs);
      if (!rate.ok) throw new CoachError('rate-limited', { retryAfterMs: rate.retryAfterMs });
      creditsRemaining = account.creditsRemaining - 1;
      tx.set(r.rateLimit, { recent: rate.recent, updatedAt: FieldValue.serverTimestamp() });
      tx.set(r.account, { ...account, creditsRemaining, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    } else if (accountChanged) {
      tx.set(r.account, { ...account, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }

    const attempt = (existing?.attempt ?? 0) + 1;
    const turn: TurnRecord = {
      status: 'pending',
      creditCharged: true,
      channel: p.channel,
      conversationId: p.conversationId,
      inputHash: p.inputHash,
      periodKey: account.creditsPeriodKey,
      attempt,
      leaseUntilMs: p.nowMs + LIMITS.turnLeaseMs,
    };
    tx.set(turnRef, {
      ...turn,
      updatedAt: FieldValue.serverTimestamp(),
      ...(existing ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });

    let conversation: ConversationState;
    if (convSnap.exists) {
      const c = convSnap.data()!;
      conversation = {
        mode: c.mode === 'reflection' ? 'reflection' : 'normal',
        ...(typeof c.reflectionCheckInId === 'string' ? { reflectionCheckInId: c.reflectionCheckInId } : {}),
        ...(typeof c.summary === 'string' ? { summary: c.summary } : {}),
        summaryMessageCount: typeof c.summaryMessageCount === 'number' ? c.summaryMessageCount : 0,
      };
    } else {
      const mode = p.mode ?? 'normal';
      conversation = {
        mode,
        ...(mode === 'reflection' && p.reflectionCheckInId ? { reflectionCheckInId: p.reflectionCheckInId } : {}),
        summaryMessageCount: 0,
      };
      tx.set(convRef, {
        title: conversationTitle(p.userText, p.channel),
        mode,
        ...(conversation.reflectionCheckInId ? { reflectionCheckInId: conversation.reflectionCheckInId } : {}),
        messageCount: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    if (p.userText !== undefined && !userMsgSnap.exists) {
      tx.set(userMsgRef, {
        role: 'user',
        text: p.userText,
        clientTurnId: p.clientTurnId,
        channel: p.channel,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(convRef, { messageCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp(), lastMessageAt: FieldValue.serverTimestamp() }, { merge: true });
    }

    return { kind: 'run', attempt, creditsRemaining, conversation, tookOver: takeOver } as const;
  });
}

/** Voice turns: the transcript becomes the user message once STT has produced it. */
export async function recordVoiceUserMessage(
  db: Firestore,
  p: { uid: string; conversationId: string; clientTurnId: string; transcript: string },
): Promise<void> {
  const r = refs(db, p.uid);
  const msgRef = r.message(p.conversationId, userMessageId(p.clientTurnId));
  const convRef = r.conversation(p.conversationId);
  await db.runTransaction(async (tx) => {
    const [msg, conv] = await Promise.all([tx.get(msgRef), tx.get(convRef)]);
    tx.set(r.turn(p.clientTurnId), { transcript: p.transcript }, { merge: true });
    if (msg.exists) return;
    tx.set(msgRef, { role: 'user', text: p.transcript, clientTurnId: p.clientTurnId, channel: 'voice', createdAt: FieldValue.serverTimestamp() });
    const convUpdate: Record<string, unknown> = {
      messageCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
      lastMessageAt: FieldValue.serverTimestamp(),
    };
    if (conv.data()?.title === 'Voice session') convUpdate.title = conversationTitle(p.transcript, 'voice');
    tx.set(convRef, convUpdate, { merge: true });
  });
}

export type CompleteTurnParams = {
  uid: string;
  clientTurnId: string;
  conversationId: string;
  channel: Channel;
  reply: string;
  proposal?: GoalProgressProposal;
  summary?: { text: string; messageCount: number };
};

/** Writes the coach message and marks the turn completed. Returns the stored turn (first writer wins). */
export async function completeTurn(db: Firestore, p: CompleteTurnParams): Promise<{ turn: TurnRecord; creditsRemaining: number }> {
  const r = refs(db, p.uid);
  const turnRef = r.turn(p.clientTurnId);
  const convRef = r.conversation(p.conversationId);
  return db.runTransaction(async (tx) => {
    const [turnSnap, accountSnap] = await Promise.all([tx.get(turnRef), tx.get(r.account)]);
    const creditsRemaining = (accountSnap.data()?.creditsRemaining as number | undefined) ?? 0;
    const turn = turnSnap.data() as TurnRecord | undefined;
    if (!turn) throw new CoachError('internal');
    if (turn.status === 'completed') return { turn, creditsRemaining };

    const completed: TurnRecord = { ...turn, status: 'completed', reply: p.reply, proposal: p.proposal ?? null, leaseUntilMs: 0 };
    tx.set(turnRef, { ...completed, updatedAt: FieldValue.serverTimestamp(), completedAt: FieldValue.serverTimestamp() });
    tx.set(r.message(p.conversationId, coachMessageId(p.clientTurnId)), {
      role: 'coach',
      text: p.reply,
      clientTurnId: p.clientTurnId,
      channel: p.channel,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(convRef, {
      messageCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
      lastMessageAt: FieldValue.serverTimestamp(),
      ...(p.summary ? { summary: p.summary.text, summaryMessageCount: p.summary.messageCount } : {}),
    }, { merge: true });
    return { turn: completed, creditsRemaining };
  });
}

/** Marks a running turn failed and refunds its credit (only once, only for the current attempt). */
export async function failTurn(db: Firestore, p: { uid: string; clientTurnId: string; attempt: number }): Promise<number> {
  const r = refs(db, p.uid);
  const turnRef = r.turn(p.clientTurnId);
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