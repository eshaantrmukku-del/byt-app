import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import { friendlyError } from '@/features/auth/authErrors';
import { CONVERSATION_TITLE_LIMIT, DEFAULT_TITLES, titleFromMessage } from '@/features/chat/chat';
import { parseMessage } from '@/features/parse';
import { requireFirebase } from '@/lib/firebase';
import { useChatStore } from '@/stores/chatStore';
import type { ChatMessage, ConversationMode, IsoDate } from '@/types/models';

import { userCollection } from './userDataService';
import { trackWrite } from './writes';

function messagesCollection(uid: string, conversationId: string) {
  return collection(requireFirebase().db, 'users', uid, 'conversations', conversationId, 'messages');
}

/** Creates a conversation and returns its id immediately (the write syncs in the background). */
export function createConversation(
  uid: string,
  options: { mode: ConversationMode; reflectionCheckInId?: IsoDate } = { mode: 'normal' }
): string {
  const ref = doc(userCollection(uid, 'conversations'));
  void trackWrite(
    setDoc(ref, {
      title: DEFAULT_TITLES[options.mode],
      mode: options.mode,
      ...(options.reflectionCheckInId ? { reflectionCheckInId: options.reflectionCheckInId } : {}),
      titleEdited: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  ).catch(() => undefined);
  return ref.id;
}

export function renameConversation(uid: string, conversationId: string, title: string) {
  const value = title.trim().slice(0, CONVERSATION_TITLE_LIMIT);
  if (!value) return Promise.resolve('synced' as const);
  return trackWrite(
    updateDoc(doc(userCollection(uid, 'conversations'), conversationId), {
      title: value,
      titleEdited: true,
      updatedAt: serverTimestamp(),
    })
  );
}

/** Names a conversation after its first message, unless the user has renamed it. */
export function autoTitleConversation(uid: string, conversationId: string, firstMessage: string) {
  const title = titleFromMessage(firstMessage);
  if (!title) return;
  void trackWrite(
    updateDoc(doc(userCollection(uid, 'conversations'), conversationId), { title, updatedAt: serverTimestamp() })
  ).catch(() => undefined);
}

/** Deletes a conversation and its messages. */
export async function deleteConversation(uid: string, conversationId: string): Promise<void> {
  const { db } = requireFirebase();
  const messages = await getDocs(messagesCollection(uid, conversationId));
  for (let i = 0; i < messages.docs.length; i += 400) {
    const batch = writeBatch(db);
    messages.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await trackWrite(batch.commit());
  }
  await trackWrite(deleteDoc(doc(userCollection(uid, 'conversations'), conversationId)));
}

/** Streams a conversation's messages into the chat store. Returns an unsubscribe. */
export function watchMessages(uid: string, conversationId: string): () => void {
  const store = useChatStore.getState();
  if (!store.messages[conversationId]) store.setMessages(conversationId, { status: 'loading', items: [], error: null });
  let confirmed = false;
  return onSnapshot(
    messagesCollection(uid, conversationId),
    { includeMetadataChanges: true },
    (snap) => {
      // An empty first answer from the local cache doesn't mean "no messages".
      if (snap.metadata.fromCache && !confirmed && snap.empty) return;
      if (!snap.metadata.fromCache) confirmed = true;
      const items = snap.docs
        .map((d) => parseMessage(d.id, d.data({ serverTimestamps: 'estimate' })))
        .filter((m): m is ChatMessage => m !== null);
      useChatStore.getState().setMessages(conversationId, { status: 'ready', items, error: null });
    },
    (error) => {
      const current = useChatStore.getState().messages[conversationId];
      useChatStore.getState().setMessages(conversationId, {
        status: 'unavailable',
        items: current?.items ?? [],
        error: friendlyError(error, 'Couldn’t load this conversation.'),
      });
    }
  );
}
