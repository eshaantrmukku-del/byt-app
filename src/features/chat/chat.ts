import type { ChatMessage, Conversation, ConversationMode } from '@/types/models';

export const DEFAULT_TITLES: Record<ConversationMode, string> = {
  normal: 'Coaching session',
  reflection: 'Reflection discussion',
};

export const CONVERSATION_TITLE_LIMIT = 80;

/** A user turn this device has sent (or is sending) but the server hasn't stored yet. */
export type PendingTurn = {
  requestId: string;
  uid: string;
  conversationId: string;
  text: string;
  createdAt: number;
  status: 'sending' | 'failed' | 'delivered';
  /** User-facing reason when failed. */
  error?: string;
  /** Kept until the server's own reply document arrives, so nothing flickers. */
  reply?: { text: string; createdAt: number };
};

export type TimelineItem = {
  key: string;
  role: 'user' | 'coach';
  text: string;
  state: 'sent' | 'sending' | 'failed';
  requestId?: string;
  error?: string;
};

/** Title for a conversation from its first user message, as the prototype did (30 chars + "..."). */
export function titleFromMessage(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 30 ? `${clean.substring(0, 30)}...` : clean;
}

/**
 * Local invite shown until the first message. The backend has no free opener
 * (`coachTurn` always requires user text and spends a credit), so this is not stored.
 */
export function sessionGreeting(mode: ConversationMode): string {
  if (mode === 'reflection') {
    return 'Let’s look at this check-in together. What stands out most, and what would you like to do with it?';
  }
  return 'What do you most want to move forward on this week, and what would make that meaningful?';
}

export function shouldAutoTitle(conversation: Pick<Conversation, 'title' | 'titleEdited' | 'mode'>): boolean {
  return !conversation.titleEdited && conversation.title === DEFAULT_TITLES[conversation.mode];
}

const byTime = (a: ChatMessage, b: ChatMessage) =>
  a.createdAt - b.createdAt || (a.role === b.role ? 0 : a.role === 'user' ? -1 : 1);

/**
 * Server messages in order, then this device's pending turns that the server
 * hasn't stored yet. Delivered turns also show their reply until it syncs.
 */
export function buildTimeline(messages: readonly ChatMessage[], pending: readonly PendingTurn[]): TimelineItem[] {
  const items: TimelineItem[] = [...messages].sort(byTime).map((m) => ({
    key: m.id,
    role: m.role,
    text: m.text,
    state: 'sent',
  }));
  const storedUserTurns = new Set(messages.filter((m) => m.role === 'user').map((m) => m.clientTurnId));
  const storedReplies = new Set(messages.filter((m) => m.role === 'coach').map((m) => m.clientTurnId));

  for (const turn of [...pending].sort((a, b) => a.createdAt - b.createdAt)) {
    if (!storedUserTurns.has(turn.requestId)) {
      items.push({
        key: `pending-${turn.requestId}`,
        role: 'user',
        text: turn.text,
        state: turn.status === 'failed' ? 'failed' : turn.status === 'sending' ? 'sending' : 'sent',
        requestId: turn.requestId,
        error: turn.error,
      });
    }
    if (turn.reply && !storedReplies.has(turn.requestId)) {
      items.push({ key: `pending-reply-${turn.requestId}`, role: 'coach', text: turn.reply.text, state: 'sent' });
    }
  }
  return items;
}

/** A pending turn can be dropped once both sides are stored on the server. */
export function isTurnSynced(turn: PendingTurn, messages: readonly ChatMessage[]): boolean {
  const ids = new Set(messages.map((m) => `${m.role}:${m.clientTurnId}`));
  return ids.has(`user:${turn.requestId}`) && ids.has(`coach:${turn.requestId}`);
}

export function sortConversations(conversations: readonly Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** "Just now", "5m ago", "3h ago", "2d ago", then a date — as in the prototype's history list. */
export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const diffMs = now - timestamp;
  const mins = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function nextResetLabel(periodKey: string): string {
  const [y, m] = periodKey.split('-').map((x) => Number.parseInt(x, 10));
  if (!y || !m) return '';
  return new Date(y, m, 1).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function currentPeriodKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
