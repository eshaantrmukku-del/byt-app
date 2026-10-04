import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Pencil, Phone, Plus, RotateCcw, Send } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { buildTimeline, currentPeriodKey, isTurnSynced, nextResetLabel, shouldAutoTitle, sortConversations, type TimelineItem } from '@/features/chat/chat';
import { COACH_TEXT_LIMIT } from '@/services/coach/types';
import { discardMessage, requestOpener, retryMessage, sendMessage } from '@/services/coach/turns';
import { autoTitleConversation, createConversation, renameConversation, watchMessages } from '@/services/conversationsService';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore, usePendingTurnsStore } from '@/stores/chatStore';
import { useCreditsStore } from '@/stores/creditsStore';
import { useUserDataStore } from '@/stores/userDataStore';
import { MONTHLY_CREDIT_ALLOWANCE } from '@/types/models';
import { theme } from '@/ui';
import { RenameChatModal } from '@/ui/RenameChatModal';

export default function AiCoachScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const uid = useAuthStore((s) => s.user?.uid);
  const conversations = useUserDataStore((s) => s.conversations);
  const activeId = useChatStore((s) => s.activeConversationId);
  const setActive = useChatStore((s) => s.setActive);
  const account = useCreditsStore((s) => s.account);

  // Which conversation to show: an explicit one, the last one opened, the most recent, or a new one.
  useEffect(() => {
    if (params.id) setActive(params.id);
  }, [params.id, setActive]);
  const knownActive = conversations.items.find((c) => c.id === activeId)?.id;
  const conversationId =
    params.id ?? (activeId && (knownActive || conversations.status !== 'ready') ? activeId : null) ?? sortConversations(conversations.items)[0]?.id ?? null;
  useEffect(() => {
    if (conversationId || !uid || conversations.status !== 'ready') return;
    setActive(createConversation(uid));
  }, [conversationId, uid, conversations.status, setActive]);

  const conversation = conversations.items.find((c) => c.id === conversationId);
  const messagesState = useChatStore((s) => (conversationId ? s.messages[conversationId] : undefined));
  const opener = useChatStore((s) => (conversationId ? s.openers[conversationId] : undefined));
  const allPending = usePendingTurnsStore((s) => s.turns);
  const pending = useMemo(
    () => allPending.filter((t) => t.conversationId === conversationId && t.uid === uid),
    [allPending, conversationId, uid]
  );

  useEffect(() => {
    if (!uid || !conversationId) return;
    return watchMessages(uid, conversationId);
  }, [uid, conversationId]);

  const messages = useMemo(() => messagesState?.items ?? [], [messagesState]);

  // Start a new session with a coach opener (free, generated once per conversation).
  useEffect(() => {
    if (!conversation || messagesState?.status !== 'ready') return;
    if (messages.length > 0 || pending.length > 0 || opener) return;
    void requestOpener(conversation);
  }, [conversation, messagesState?.status, messages.length, pending.length, opener]);

  // Drop local copies once the server has stored both sides of a turn.
  useEffect(() => {
    pending.filter((t) => t.status === 'delivered' && isTurnSynced(t, messages)).forEach((t) => discardMessage(t.requestId));
  }, [pending, messages]);

  const timeline = useMemo(() => buildTimeline(messages, pending), [messages, pending]);
  const sending = pending.some((t) => t.status === 'sending');
  const isTyping = sending || opener?.state === 'loading';

  const [inputText, setInputText] = useState('');
  const [noCredits, setNoCredits] = useState(false);
  const [renameVisible, setRenameVisible] = useState(false);
  const sendLock = useRef(false);
  const listRef = useRef<FlatList<TimelineItem>>(null);

  const creditsRemaining = account?.creditsRemaining ?? MONTHLY_CREDIT_ALLOWANCE;
  const outOfCredits = noCredits || (account !== null && account.creditsRemaining <= 0);
  const resetLabel = nextResetLabel(account?.creditsPeriodKey || currentPeriodKey());

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !uid || !conversation || sending || sendLock.current) return;
    if (outOfCredits) {
      setNoCredits(true);
      return;
    }
    sendLock.current = true;
    setInputText('');
    const isFirstUserMessage = !messages.some((m) => m.role === 'user') && pending.length === 0;
    if (isFirstUserMessage && shouldAutoTitle(conversation)) autoTitleConversation(uid, conversation.id, text);
    try {
      const result = await sendMessage(uid, conversation, text);
      if (!result.ok && result.reason === 'no-credits') {
        setNoCredits(true);
        setInputText(text);
      }
    } finally {
      sendLock.current = false;
    }
  };

  const handleRetry = (requestId: string) => {
    if (!conversation || sending) return;
    void retryMessage(requestId, conversation).then((r) => {
      if (!r.ok && r.reason === 'no-credits') setNoCredits(true);
    });
  };

  const handleFailedPress = (item: TimelineItem) => {
    if (!item.requestId) return;
    const requestId = item.requestId;
    if (Platform.OS === 'web') return handleRetry(requestId);
    Alert.alert('Message not sent', item.error ?? 'Tap retry to send it again.', [
      { text: 'Delete', style: 'destructive', onPress: () => discardMessage(requestId) },
      { text: 'Cancel', style: 'cancel' },
      { text: 'Retry', onPress: () => handleRetry(requestId) },
    ]);
  };

  const handleNewChat = () => {
    if (!uid) return;
    setNoCredits(false);
    const id = createConversation(uid);
    setActive(id);
    if (params.id) router.setParams({ id });
  };

  const renderItem = ({ item }: { item: TimelineItem }) => {
    const isUser = item.role === 'user';
    const failed = item.state === 'failed';
    return (
      <View style={[styles.messageWrap, isUser ? styles.userWrap : styles.aiWrap]}>
        <TouchableOpacity
          activeOpacity={failed ? 0.7 : 1}
          disabled={!failed}
          onPress={() => handleFailedPress(item)}
          style={[
            styles.messageBubble,
            isUser ? styles.userBubble : styles.aiBubble,
            isUser && item.state === 'sending' && styles.sendingBubble,
            failed && styles.failedBubble,
          ]}
          accessibilityLabel={failed ? `Not sent: ${item.text}. Tap to retry.` : undefined}
        >
          <Text style={[styles.messageText, { color: isUser ? '#fff' : theme.text }]}>{item.text}</Text>
        </TouchableOpacity>
        {failed ? (
          <TouchableOpacity onPress={() => item.requestId && handleRetry(item.requestId)} style={styles.retryRow} accessibilityRole="button" accessibilityLabel="Retry sending">
            <RotateCcw size={12} color="#F87171" />
            <Text style={styles.retryText}>{item.error ?? 'Not sent'} · Tap to retry</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  const listFooter = isTyping ? (
    <View style={styles.typing}>
      <Text style={styles.typingText}>Typing...</Text>
    </View>
  ) : opener?.state === 'failed' && timeline.length === 0 ? (
    <View style={[styles.messageWrap, styles.aiWrap]}>
      <TouchableOpacity
        style={[styles.messageBubble, styles.aiBubble]}
        onPress={() => conversation && void requestOpener(conversation)}
        accessibilityRole="button"
      >
        <Text style={[styles.messageText, { color: theme.text }]}>{opener.error} Tap to try again.</Text>
      </TouchableOpacity>
    </View>
  ) : null;

  const loading = !conversation || !messagesState || messagesState.status === 'loading';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back">
          <ChevronLeft size={24} color={theme.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.flex}
          onPress={() => conversation && setRenameVisible(true)}
          activeOpacity={0.7}
          disabled={!conversation}
          accessibilityRole="button"
          accessibilityLabel="Rename conversation"
        >
          <View style={styles.titleRow}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {conversation?.title ?? 'AI Coach'}
            </Text>
            {conversation ? <Pencil size={14} color={theme.primary} style={styles.pencil} /> : null}
          </View>
          <Text style={styles.headerSubtitle}>
            {creditsRemaining}/{MONTHLY_CREDIT_ALLOWANCE} credits · resets {resetLabel}
          </Text>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={() => conversationId && router.push({ pathname: '/voice-call', params: { id: conversationId } })}
            style={styles.iconButton}
            disabled={!conversationId}
            accessibilityRole="button"
            accessibilityLabel="Voice call"
          >
            <Phone size={22} color={theme.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleNewChat} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="New conversation">
            <Plus size={24} color={theme.text} />
          </TouchableOpacity>
        </View>
      </View>

      {outOfCredits ? (
        <View style={styles.creditBanner}>
          <Text style={styles.creditBannerText}>You&apos;ve run out of credits for this month</Text>
          <Text style={styles.creditBannerHint}>They reset on {resetLabel}.</Text>
          <TouchableOpacity style={styles.creditBannerBtn} onPress={() => router.push('/settings')} accessibilityRole="button">
            <Text style={styles.creditBannerBtnText}>Manage subscription</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>
        {loading && conversations.status !== 'unavailable' ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.textSecondary} />
          </View>
        ) : conversations.status === 'unavailable' && !conversation ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>{conversations.error ?? 'Couldn’t load your conversations.'}</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            style={styles.flex}
            data={timeline}
            renderItem={renderItem}
            keyExtractor={(item) => item.key}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            ListFooterComponent={listFooter}
          />
        )}

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Message your coach…"
            placeholderTextColor="#94A3B8"
            accessibilityLabel="Message your coach"
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={COACH_TEXT_LIMIT}
            editable={!outOfCredits}
            onFocus={() => setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)}
          />
          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: inputText.trim() && !outOfCredits && !sending ? theme.primary : '#94A3B8' }]}
            onPress={() => void handleSend()}
            disabled={!inputText.trim() || sending || outOfCredits || !conversation}
            accessibilityRole="button"
            accessibilityLabel="Send"
          >
            <Send size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <RenameChatModal
        visible={renameVisible}
        initialTitle={conversation?.title ?? ''}
        onClose={() => setRenameVisible(false)}
        onSave={(title) => {
          if (uid && conversation) void renameConversation(uid, conversation.id, title).catch(() => undefined);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: theme.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    backgroundColor: theme.background,
  },
  backButton: { padding: 8, marginLeft: -8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', maxWidth: '100%' },
  headerTitle: { fontSize: 16, fontWeight: '700', flexShrink: 1, color: theme.text },
  pencil: { marginLeft: 6 },
  headerSubtitle: { fontSize: 11, marginTop: 2, color: theme.textSecondary },
  headerRight: { flexDirection: 'row', gap: 4 },
  iconButton: { padding: 8 },
  creditBanner: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    backgroundColor: '#1e293b',
  },
  creditBannerText: { fontSize: 15, fontWeight: '600', marginBottom: 4, color: theme.text },
  creditBannerHint: { fontSize: 13, color: theme.textSecondary, marginBottom: 10 },
  creditBannerBtn: { alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: theme.primary },
  creditBannerBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: theme.textSecondary, textAlign: 'center' },
  listContent: { padding: 16, paddingBottom: 20 },
  messageWrap: { marginBottom: 12, maxWidth: '80%' },
  userWrap: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  aiWrap: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  messageBubble: { padding: 12, borderRadius: 20 },
  userBubble: { borderBottomRightRadius: 4, backgroundColor: theme.primary },
  aiBubble: { borderBottomLeftRadius: 4, backgroundColor: theme.card },
  sendingBubble: { opacity: 0.75 },
  failedBubble: { backgroundColor: 'rgba(239,68,68,0.55)' },
  messageText: { fontSize: 16, lineHeight: 22 },
  retryRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  retryText: { color: '#F87171', fontSize: 12, fontWeight: '600' },
  typing: { padding: 10, marginLeft: 10 },
  typingText: { color: theme.icon, fontStyle: 'italic' },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
    borderTopWidth: 1,
    gap: 12,
    backgroundColor: theme.card,
    borderTopColor: theme.border,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 16,
    color: theme.text,
    backgroundColor: theme.surface,
  },
  sendButton: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
});
