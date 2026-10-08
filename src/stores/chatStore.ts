import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { PendingTurn } from '@/features/chat/chat';
import type { ChatMessage } from '@/types/models';

type MessagesState = { status: 'loading' | 'ready' | 'unavailable'; items: ChatMessage[]; error: string | null };

export type OpenerRecord =
  | { state: 'loading' }
  | { state: 'failed'; error: string }
  | { state: 'sent'; text: string };

type ChatState = {
  /** Conversation shown by the coach screen; chosen from history or created. */
  activeConversationId: string | null;
  messages: Record<string, MessagesState>;
  openers: Record<string, OpenerRecord>;
  setActive: (id: string | null) => void;
  setMessages: (conversationId: string, state: MessagesState) => void;
  setOpener: (conversationId: string, state: OpenerRecord | null) => void;
  reset: () => void;
};

export const useChatStore = create<ChatState>()((set) => ({
  activeConversationId: null,
  messages: {},
  openers: {},
  setActive: (activeConversationId) => set({ activeConversationId }),
  setMessages: (conversationId, state) => set((s) => ({ messages: { ...s.messages, [conversationId]: state } })),
  setOpener: (conversationId, state) =>
    set((s) => {
      const openers = { ...s.openers };
      if (state) openers[conversationId] = state;
      else delete openers[conversationId];
      return { openers };
    }),
  reset: () => set({ activeConversationId: null, messages: {}, openers: {} }),
}));

type PendingState = {
  turns: PendingTurn[];
  upsert: (turn: PendingTurn) => void;
  update: (requestId: string, changes: Partial<PendingTurn>) => void;
  remove: (requestId: string) => void;
};

/**
 * Unsent and in-flight user turns, kept on the device (per uid) so a message
 * typed offline or interrupted by an app restart can be retried, not lost.
 */
export const usePendingTurnsStore = create<PendingState>()(
  persist(
    (set) => ({
      turns: [],
      upsert: (turn) => set((s) => ({ turns: [...s.turns.filter((t) => t.requestId !== turn.requestId), turn] })),
      update: (requestId, changes) =>
        set((s) => ({ turns: s.turns.map((t) => (t.requestId === requestId ? { ...t, ...changes } : t)) })),
      remove: (requestId) => set((s) => ({ turns: s.turns.filter((t) => t.requestId !== requestId) })),
    }),
    {
      name: 'byt-pending-turns-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ turns: s.turns }),
      // A turn that was mid-flight when the app closed must be retried explicitly.
      merge: (persisted, current) => {
        const turns = ((persisted as { turns?: PendingTurn[] } | undefined)?.turns ?? []).map((t) =>
          t.status === 'sending' ? { ...t, status: 'failed' as const, error: 'Not sent. Tap to retry.' } : t
        );
        return { ...current, turns };
      },
    }
  )
);
