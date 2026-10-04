import { requestUserFirestoreFlush } from '@/services/userFirestoreCoordinator';
import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export type ChatMode = 'normal' | 'reflection';

export interface ReflectionContextPayload {
  checkInId: string;
  date: string;
  mood: string;
  happiness: number;
  stress: number;
  sleep: number;
  reflection: string;
  win: string;
  notes: string;
}

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: number;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  mode: ChatMode;
  reflectionContext?: ReflectionContextPayload | null;
  /** false = client should request an AI session opener */
  openingComplete: boolean;
  /** true after user renames — do not auto-replace title from first message */
  titleManuallyEdited?: boolean;
}

interface ChatsContextType {
  chats: Chat[];
  activeChat: Chat | null;
  createNewChat: () => string;
  createReflectionDiscussionChat: (payload: ReflectionContextPayload) => string;
  setActiveChat: (chatId: string) => void;
  addMessageToChat: (chatId: string, message: Message) => void;
  markChatOpeningComplete: (chatId: string) => void;
  updateChatTitle: (chatId: string, title: string) => void;
  deleteChat: (chatId: string) => void;
  hydrateChats: (chats: unknown[]) => void;
  resetChatsToDefault: () => void;
}

const ChatsContext = createContext<ChatsContextType | undefined>(undefined);

const CHATS_STORAGE_KEY = 'ascend-chats-v3';

const chatsStateRef = { current: [] as Chat[] };

/** Latest activity timestamp across chats — used to avoid stale Firestore overwrites. */
export function getChatsRevision(chats: Chat[]): number {
  let rev = 0;
  for (const chat of chats) {
    rev = Math.max(rev, chat.updatedAt, chat.createdAt);
    for (const msg of chat.messages) {
      rev = Math.max(rev, msg.timestamp);
    }
  }
  return rev;
}

export function migrateChat(raw: unknown): Chat {
  const c = raw as Partial<Chat> & { id: string; title: string; messages: Message[]; createdAt: number; updatedAt: number };
  const mode: ChatMode = c.mode === 'reflection' ? 'reflection' : 'normal';
  const messages = Array.isArray(c.messages) ? c.messages : [];
  const openingComplete =
    typeof c.openingComplete === 'boolean' ? c.openingComplete : messages.length > 0;
  return {
    id: c.id,
    title: c.title || 'Conversation',
    messages,
    createdAt: c.createdAt ?? Date.now(),
    updatedAt: c.updatedAt ?? Date.now(),
    mode,
    reflectionContext: c.reflectionContext ?? null,
    openingComplete,
    titleManuallyEdited: c.titleManuallyEdited ?? false,
  };
}

export function createDefaultChats(): Chat[] {
  const now = Date.now();
  return [
    {
      id: '1',
      title: 'Coaching session',
      messages: [],
      createdAt: now,
      updatedAt: now,
      mode: 'normal',
      reflectionContext: null,
      openingComplete: false,
    },
  ];
}

async function saveChatsToDisk(chats: Chat[]) {
  try {
    if (Platform.OS === 'web' && typeof window === 'undefined') return;
    await AsyncStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(chats));
  } catch (e) {
    console.error('Error persisting chats:', e);
  }
}

async function persistChatsAfterUserEdit(chats: Chat[]) {
  await saveChatsToDisk(chats);
  requestUserFirestoreFlush();
}

export const ChatsProvider = ({ children }: { children: ReactNode }) => {
  const initial = createDefaultChats();
  const [chats, setChats] = useState<Chat[]>(initial);
  const [activeChatId, setActiveChatId] = useState<string>(initial[0].id);

  const activeChat = chats.find((chat) => chat.id === activeChatId) || null;

  useEffect(() => {
    chatsStateRef.current = chats;
  }, [chats]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (Platform.OS === 'web' && typeof window === 'undefined') return;
        const raw = await AsyncStorage.getItem(CHATS_STORAGE_KEY);
        if (cancelled || !raw) return;
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed) || parsed.length === 0) return;
        const migrated = parsed.map(migrateChat);
        // An empty logout copy must not replace live or cloud chats.
        if (!migrated.some((chat) => chat.messages.length > 0)) return;
        const diskRevision = getChatsRevision(migrated);
        const current = chatsStateRef.current;
        const currentHasContent = current.some((chat) => chat.messages.length > 0);
        if (currentHasContent && getChatsRevision(current) >= diskRevision) return;
        chatsStateRef.current = migrated;
        setChats(migrated);
        setActiveChatId(migrated[0].id);
        requestUserFirestoreFlush();
      } catch (e) {
        console.error('Error loading chats cache:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const resetChatsToDefault = useCallback(() => {
    const next = createDefaultChats();
    // Keep ref in sync immediately so a concurrent flush cannot race on stale chats.
    chatsStateRef.current = next;
    setChats(next);
    setActiveChatId(next[0].id);
    void saveChatsToDisk(next);
  }, []);

  const createNewChat = (): string => {
    const newChatId = Date.now().toString();
    const newChat: Chat = {
      id: newChatId,
      title: 'Coaching session',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      mode: 'normal',
      reflectionContext: null,
      openingComplete: false,
    };
    setChats((prev) => {
      const updated = [newChat, ...prev];
      chatsStateRef.current = updated;
      void persistChatsAfterUserEdit(updated);
      return updated;
    });
    setActiveChatId(newChatId);
    return newChatId;
  };

  const createReflectionDiscussionChat = (payload: ReflectionContextPayload): string => {
    const newChatId = Date.now().toString();
    const newChat: Chat = {
      id: newChatId,
      title: 'Reflection discussion',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      mode: 'reflection',
      reflectionContext: payload,
      openingComplete: false,
    };
    setChats((prev) => {
      const updated = [newChat, ...prev];
      chatsStateRef.current = updated;
      void persistChatsAfterUserEdit(updated);
      return updated;
    });
    setActiveChatId(newChatId);
    return newChatId;
  };

  const setActiveChat = (chatId: string) => {
    setActiveChatId(chatId);
  };

  const addMessageToChat = (chatId: string, message: Message) => {
    setChats((prev) => {
      const updated = prev.map((chat) => {
        if (chat.id === chatId) {
          const updatedMessages = [...chat.messages, message];
          let title = chat.title;
          if (
            !chat.titleManuallyEdited &&
            (title === 'Coaching session' || title === 'New Conversation') &&
            message.sender === 'user'
          ) {
            title = message.text.substring(0, 30) + (message.text.length > 30 ? '...' : '');
          }
          return {
            ...chat,
            messages: updatedMessages,
            title,
            updatedAt: Date.now(),
          };
        }
        return chat;
      });
      chatsStateRef.current = updated;
      void persistChatsAfterUserEdit(updated);
      return updated;
    });
  };

  const markChatOpeningComplete = (chatId: string) => {
    setChats((prev) => {
      const updated = prev.map((chat) =>
        chat.id === chatId ? { ...chat, openingComplete: true, updatedAt: Date.now() } : chat
      );
      chatsStateRef.current = updated;
      void persistChatsAfterUserEdit(updated);
      return updated;
    });
  };

  const updateChatTitle = (chatId: string, title: string) => {
    setChats((prev) => {
      const updated = prev.map((chat) => {
        if (chat.id === chatId) {
          return { ...chat, title, titleManuallyEdited: true, updatedAt: Date.now() };
        }
        return chat;
      });
      chatsStateRef.current = updated;
      void persistChatsAfterUserEdit(updated);
      return updated;
    });
  };

  const deleteChat = (chatId: string) => {
    setChats((prev) => {
      const filtered = prev.filter((chat) => chat.id !== chatId);
      if (activeChatId === chatId && filtered.length > 0) {
        setActiveChatId(filtered[0].id);
      }
      chatsStateRef.current = filtered;
      void persistChatsAfterUserEdit(filtered);
      return filtered;
    });
  };

  const hydrateChats = useCallback(
    (loadedChats: unknown[]) => {
      if (!Array.isArray(loadedChats) || loadedChats.length === 0) {
        const next = createDefaultChats();
        chatsStateRef.current = next;
        setChats(next);
        setActiveChatId(next[0].id);
        void saveChatsToDisk(next);
        // Do not flush here — FirebaseUserSync owns first-write after hydrate.
        return;
      }
      const migrated = loadedChats.map(migrateChat);
      chatsStateRef.current = migrated;
      setChats(migrated);
      setActiveChatId(migrated[0].id);
      void saveChatsToDisk(migrated);
    },
    []
  );

  return (
    <ChatsContext.Provider
      value={{
        chats,
        activeChat,
        createNewChat,
        createReflectionDiscussionChat,
        setActiveChat,
        addMessageToChat,
        markChatOpeningComplete,
        updateChatTitle,
        deleteChat,
        hydrateChats,
        resetChatsToDefault,
      }}
    >
      {children}
    </ChatsContext.Provider>
  );
};

export const useChats = () => {
  const context = useContext(ChatsContext);
  if (!context) {
    throw new Error('useChats must be used within a ChatsProvider');
  }
  return context;
};

export { chatsStateRef };
