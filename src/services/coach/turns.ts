import type { PendingTurn } from '@/features/chat/chat';
import { useChatStore, usePendingTurnsStore } from '@/stores/chatStore';
import { useCreditsStore } from '@/stores/creditsStore';
import type { Conversation } from '@/types/models';

import { coachClient, newRequestId, openerRequestId } from './coachClient';
import { toCoachError } from './errors';
import type { CoachTurnResponse } from './types';

export type SendResult = { ok: true } | { ok: false; reason: 'no-credits' | 'failed'; message: string };

function applyCredits(response: CoachTurnResponse) {
  const current = useCreditsStore.getState().account;
  useCreditsStore.getState().setAccount({
    plan: current?.plan ?? 'standard',
    creditsRemaining: response.credits.remaining,
    creditsPeriodKey: response.credits.periodKey,
  });
}

function target(conversation: Conversation) {
  return {
    conversationId: conversation.id,
    mode: conversation.mode,
    ...(conversation.reflectionCheckInId ? { reflectionCheckInId: conversation.reflectionCheckInId } : {}),
  };
}

async function deliver(turn: PendingTurn, conversation: Conversation): Promise<SendResult> {
  const pending = usePendingTurnsStore.getState();
  pending.upsert({ ...turn, status: 'sending', error: undefined });
  try {
    const response = await coachClient.coachTurn({
      requestId: turn.requestId,
      kind: 'message',
      text: turn.text,
      ...target(conversation),
    });
    applyCredits(response);
    pending.update(turn.requestId, {
      status: 'delivered',
      reply: { text: response.reply.text, createdAt: response.reply.createdAt },
    });
    return { ok: true };
  } catch (error) {
    const coachError = toCoachError(error);
    if (coachError.reason === 'no-credits') {
      // Nothing was charged or stored: give the text back to the composer.
      pending.remove(turn.requestId);
      const account = useCreditsStore.getState().account;
      if (account) useCreditsStore.getState().setAccount({ ...account, creditsRemaining: 0 });
      return { ok: false, reason: 'no-credits', message: coachError.message };
    }
    pending.update(turn.requestId, { status: 'failed', error: coachError.message });
    return { ok: false, reason: 'failed', message: coachError.message };
  }
}

/** Sends a new user message. The message shows immediately and survives failures for retry. */
export function sendMessage(uid: string, conversation: Conversation, text: string): Promise<SendResult> {
  const turn: PendingTurn = {
    requestId: newRequestId(),
    uid,
    conversationId: conversation.id,
    text: text.trim(),
    createdAt: Date.now(),
    status: 'sending',
  };
  return deliver(turn, conversation);
}

/** Retries a failed turn with the same request id, so the backend never charges twice. */
export function retryMessage(requestId: string, conversation: Conversation): Promise<SendResult> {
  const turn = usePendingTurnsStore.getState().turns.find((t) => t.requestId === requestId);
  if (!turn || turn.status === 'sending') return Promise.resolve({ ok: true });
  return deliver(turn, conversation);
}

export function discardMessage(requestId: string) {
  usePendingTurnsStore.getState().remove(requestId);
}

const openersInFlight = new Set<string>();

/** Asks the coach to open a new session. Free, and at most once per conversation. */
export async function requestOpener(conversation: Conversation): Promise<void> {
  if (openersInFlight.has(conversation.id)) return;
  openersInFlight.add(conversation.id);
  const chat = useChatStore.getState();
  chat.setOpener(conversation.id, { state: 'loading' });
  try {
    const response = await coachClient.coachTurn({
      requestId: openerRequestId(conversation.id),
      kind: 'opener',
      ...target(conversation),
    });
    applyCredits(response);
    useChatStore.getState().setOpener(conversation.id, null);
  } catch (error) {
    useChatStore.getState().setOpener(conversation.id, {
      state: 'failed',
      error: "I couldn't start the session just now.",
    });
    if (__DEV__) console.warn('[coach] opener failed:', toCoachError(error).reason);
  } finally {
    openersInFlight.delete(conversation.id);
  }
}
