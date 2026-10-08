import { currentPeriodKey } from '@/features/chat/chat';
import type { PendingTurn } from '@/features/chat/chat';
import { normaliseProgress } from '@/features/goals/goals';
import { updateGoal } from '@/services/goalsService';
import { usePendingTurnsStore } from '@/stores/chatStore';
import { useCreditsStore } from '@/stores/creditsStore';
import { useUserDataStore } from '@/stores/userDataStore';
import type { Conversation } from '@/types/models';

import { coachClient, newRequestId } from './coachClient';
import { toCoachError } from './errors';
import type { GoalProgressProposal } from './types';

export type SendResult =
  | { ok: true; proposal?: GoalProgressProposal }
  | { ok: false; reason: 'no-credits' | 'failed'; message: string };

export function applyTurnCredits(creditsRemaining: number) {
  const current = useCreditsStore.getState().account;
  useCreditsStore.getState().setAccount({
    plan: current?.plan ?? 'standard',
    creditsRemaining,
    creditsPeriodKey: current?.creditsPeriodKey || currentPeriodKey(),
    ...(current?.monthlyAllowance !== undefined ? { monthlyAllowance: current.monthlyAllowance } : {}),
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
      clientTurnId: turn.requestId,
      text: turn.text,
      ...target(conversation),
    });
    applyTurnCredits(response.creditsRemaining);
    pending.update(turn.requestId, {
      status: 'delivered',
      reply: { text: response.reply, createdAt: Date.now() },
    });
    return { ok: true, ...(response.proposal ? { proposal: response.proposal } : {}) };
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

/** Retries a failed turn with the same client turn id, so the backend never charges twice. */
export function retryMessage(requestId: string, conversation: Conversation): Promise<SendResult> {
  const turn = usePendingTurnsStore.getState().turns.find((t) => t.requestId === requestId);
  if (!turn || turn.status === 'sending') return Promise.resolve({ ok: true });
  return deliver(turn, conversation);
}

export function discardMessage(requestId: string) {
  usePendingTurnsStore.getState().remove(requestId);
}

/** Applies a coach-suggested progress change after the user confirms it. Never automatic. */
export async function acceptGoalProposal(uid: string, proposal: GoalProgressProposal): Promise<'updated' | 'missing'> {
  const goal = useUserDataStore.getState().goals.items.find((g) => g.id === proposal.goalId);
  if (!goal) return 'missing';
  const progress = normaliseProgress(proposal.progress);
  const status = progress === 100 ? 'completed' : goal.status === 'completed' ? 'active' : goal.status;
  await updateGoal(uid, goal.id, { progress, status });
  return 'updated';
}
