import { RenameChatModal } from '@/components/RenameChatModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { Message, useChats } from '@/context/ChatsContext';
import {
  buildCheckInsMemory,
  buildCoachProfileSummary,
  buildPastChatsMemory,
  checkInMemoryForTurn,
  generateNormalSessionOpener,
  generateReflectionSessionOpener,
  getAiCoachResponse,
} from '@/services/ai';
import { Goal, MONTHLY_CREDIT_ALLOWANCE, useStore } from '@/store/useStore';
import { Stack, useRouter } from 'expo-router';
import { ChevronLeft, Pencil, Phone, Plus, Send } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useKeyboardBottomInset } from '@/hooks/use-keyboard-bottom-inset';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function AiCoachScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const { bottomInset, isOpen: keyboardOpen } = useKeyboardBottomInset();
  const listRef = useRef<FlatList<Message>>(null);

  const { activeChat, addMessageToChat, createNewChat, markChatOpeningComplete, updateChatTitle, chats } = useChats();
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [noCredits, setNoCredits] = useState(false);
  const [renameVisible, setRenameVisible] = useState(false);

  const {
    goals,
    checkIns,
    updateGoal,
    addGoal: addStoreGoal,
    user,
    coachProfile,
    consumeCredit,
    refundCredit,
    ensureCreditsForCurrentMonth,
    creditsRemaining,
    creditsPeriodKey,
  } = useStore();

  const messages = activeChat?.messages || [];
  const coachProfileSummary = buildCoachProfileSummary(coachProfile, user?.name || 'Client');
  const pastChatsMemory = useMemo(
    () =>
      buildPastChatsMemory(chats, activeChat?.id, 10, {
        // Keep check-in/Discuss threads out of normal-chat memory so they don't steer openers
        excludeReflection: activeChat?.mode !== 'reflection',
      }),
    [chats, activeChat?.id, activeChat?.mode]
  );
  const checkInsMemory = useMemo(() => buildCheckInsMemory(checkIns), [checkIns]);
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);

  const openerGeneration = useRef(0);

  useEffect(() => {
    ensureCreditsForCurrentMonth();
  }, [ensureCreditsForCurrentMonth]);

  useEffect(() => {
    if (!activeChat) return;
    if (activeChat.openingComplete || activeChat.messages.length > 0) return;

    const myGen = ++openerGeneration.current;
    let cancelled = false;

    (async () => {
      setIsTyping(true);
      setNoCredits(false);

      try {
        const res =
          activeChat.mode === 'reflection' && activeChat.reflectionContext
            ? await generateReflectionSessionOpener(
                goals as Goal[],
                coachProfileSummary,
                activeChat.reflectionContext
              )
            : await generateNormalSessionOpener(goals as Goal[], coachProfileSummary, Date.now() % 6);

        if (cancelled || openerGeneration.current !== myGen) return;

        const aiMsg: Message = {
          id: `${Date.now()}-opener`,
          text: res.response,
          sender: 'ai',
          timestamp: Date.now(),
        };
        addMessageToChat(activeChat.id, aiMsg);
        markChatOpeningComplete(activeChat.id);

        if (res.newGoals.length > 0) {
          res.newGoals.forEach((newGoal) => {
            addStoreGoal({
              title: newGoal.title,
              category: (newGoal.category as Goal['category']) || 'Other',
              status: 'Active',
              progress: 0,
              type: 'active',
            });
          });
        }
      } catch (e) {
        console.error('Opener error:', e);
        const errMsg: Message = {
          id: `${Date.now()}-err`,
          text: "I couldn't start the session just now. Please try opening the chat again.",
          sender: 'ai',
          timestamp: Date.now(),
        };
        if (!cancelled && openerGeneration.current === myGen) {
          addMessageToChat(activeChat.id, errMsg);
          markChatOpeningComplete(activeChat.id);
        }
      } finally {
        if (!cancelled && openerGeneration.current === myGen) setIsTyping(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeChat?.id,
    activeChat?.openingComplete,
    activeChat?.messages.length,
    activeChat?.mode,
    activeChat?.reflectionContext,
    addMessageToChat,
    coachProfileSummary,
    goals,
    markChatOpeningComplete,
    addStoreGoal,
  ]);

  const sendMessage = async () => {
    if (!inputText.trim() || !activeChat || isTyping) return;

    ensureCreditsForCurrentMonth();
    if (creditsRemaining <= 0) {
      setNoCredits(true);
      return;
    }

    const userText = inputText.trim();
    const newUserMsg: Message = {
      id: `${Date.now()}-user-${Math.random().toString(36).slice(2, 8)}`,
      text: userText,
      sender: 'user',
      timestamp: Date.now(),
    };

    addMessageToChat(activeChat.id, newUserMsg);
    setInputText('');
    setIsTyping(true);
    setNoCredits(false);

    if (!consumeCredit()) {
      setNoCredits(true);
      setIsTyping(false);
      return;
    }

    try {
      const history = [...messages, newUserMsg].map((msg) => ({
        role: msg.sender === 'user' ? ('user' as const) : ('model' as const),
        parts: [{ text: msg.text }],
      }));

      const priorHistory = history.slice(0, -1);

      const { response: aiResponseText, goalUpdates, newGoals } = await getAiCoachResponse({
        userMessage: userText,
        history: priorHistory,
        goals: goals as Goal[],
        chatMode: activeChat.mode,
        coachProfileSummary,
        pastChatsMemory,
        checkInsMemory: checkInMemoryForTurn(activeChat.mode, userText, checkInsMemory),
        reflectionContext: activeChat.mode === 'reflection' ? activeChat.reflectionContext ?? null : null,
      });

      if (newGoals.length > 0) {
        newGoals.forEach((newGoal) => {
          addStoreGoal({
            title: newGoal.title,
            category: (newGoal.category as Goal['category']) || 'Other',
            status: 'Active',
            progress: 0,
            type: 'active',
          });
        });
      }

      if (goalUpdates.length > 0) {
        goalUpdates.forEach((update) => {
          const goal = goals.find((g) => g.id === update.goalId);
          if (goal) {
            const newProgress = Math.min(100, Math.max(0, goal.progress + (update.progressChange || 0)));
            updateGoal(goal.id, { progress: newProgress });
          }
        });
      }

      const newAiMsg: Message = {
        id: `${Date.now()}-ai-${Math.random().toString(36).slice(2, 8)}`,
        text: aiResponseText,
        sender: 'ai',
        timestamp: Date.now(),
      };
      addMessageToChat(activeChat.id, newAiMsg);
    } catch (error) {
      console.error('AI Error:', error);
      refundCredit();
      const errorMsg: Message = {
        id: Date.now().toString(),
        text: "I'm having trouble connecting right now. Please try again.",
        sender: 'ai',
        timestamp: Date.now(),
      };
      addMessageToChat(activeChat.id, errorMsg);
    } finally {
      setIsTyping(false);
    }
  };

  const handleVoiceCall = () => {
    router.push('/voice-call');
  };

  const handleNewChat = () => {
    createNewChat();
  };

  const nextResetLabel = (() => {
    const [y, m] = creditsPeriodKey.split('-').map(Number);
    if (!y || !m) return '';
    const next = new Date(y, m, 1);
    return next.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  })();

  const renderItem = ({ item }: { item: Message }) => (
    <View
      style={[
        styles.messageBubble,
        item.sender === 'user' ? styles.userBubble : styles.aiBubble,
        { backgroundColor: item.sender === 'user' ? theme.primary : theme.card },
      ]}
    >
      <Text style={[styles.messageText, { color: item.sender === 'user' ? '#fff' : theme.text }]}>{item.text}</Text>
    </View>
  );

  useEffect(() => {
    if (!keyboardOpen) return;
    const t = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 80);
    return () => clearTimeout(t);
  }, [keyboardOpen, messages.length, isTyping]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={24} color={theme.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1 }}
          onPress={() => activeChat && setRenameVisible(true)}
          activeOpacity={0.7}
          disabled={!activeChat}
        >
          <View style={styles.titleRow}>
            <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
              {activeChat?.title ?? 'AI Coach'}
            </Text>
            {activeChat ? <Pencil size={14} color={theme.primary} style={{ marginLeft: 6 }} /> : null}
          </View>
          <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
            {creditsRemaining}/{MONTHLY_CREDIT_ALLOWANCE} credits · resets {nextResetLabel}
          </Text>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={handleVoiceCall} style={styles.iconButton}>
            <Phone size={22} color={theme.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleNewChat} style={styles.iconButton}>
            <Plus size={24} color={theme.text} />
          </TouchableOpacity>
        </View>
      </View>

      {noCredits ? (
        <View style={[styles.creditBanner, { backgroundColor: isDark ? '#1e293b' : '#FEF2F2' }]}>
          <Text style={[styles.creditBannerText, { color: theme.text }]}>
            {"You've run out of credits for this month"}
          </Text>
          <TouchableOpacity
            style={[styles.creditBannerBtn, { backgroundColor: theme.primary }]}
            onPress={() => router.push('/(tabs)/settings')}
          >
            <Text style={styles.creditBannerBtnText}>Manage subscription</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View
        style={[
          styles.container,
          { paddingBottom: keyboardOpen ? bottomInset : Math.max(insets.bottom, 8) },
        ]}
      >
        <FlatList
          ref={listRef}
          style={{ flex: 1 }}
          data={messages}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onContentSizeChange={() => {
            if (keyboardOpen || isTyping) {
              listRef.current?.scrollToEnd({ animated: true });
            }
          }}
          ListFooterComponent={
            isTyping ? (
              <View style={{ padding: 10, marginLeft: 10 }}>
                <Text style={{ color: theme.icon, fontStyle: 'italic' }}>Typing...</Text>
              </View>
            ) : null
          }
        />

        <View style={[styles.inputContainer, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: theme.surface }]}
            placeholder="Message your coach…"
            placeholderTextColor="#94A3B8"
            value={inputText}
            onChangeText={setInputText}
            multiline
            editable={!noCredits}
            onFocus={() => {
              setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
            }}
          />
          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: inputText.trim() && !noCredits ? theme.primary : '#94A3B8' }]}
            onPress={sendMessage}
            disabled={!inputText.trim() || isTyping || noCredits}
          >
            <Send size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <RenameChatModal
        visible={renameVisible}
        initialTitle={activeChat?.title ?? ''}
        onClose={() => setRenameVisible(false)}
        onSave={(title) => {
          if (activeChat) updateChatTitle(activeChat.id, title);
        }}
      />
    </SafeAreaView>
  );
}

const getStyles = (theme: (typeof Colors)['light'], isDark: boolean) =>
  StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.background },
  container: { flex: 1, backgroundColor: theme.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.headerBorder,
    backgroundColor: theme.background,
  },
  backButton: { padding: 8, marginLeft: -8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', maxWidth: '100%' },
  headerTitle: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
  headerSubtitle: { fontSize: 11, marginTop: 2 },
  headerRight: { flexDirection: 'row', gap: 4 },
  iconButton: { padding: 8 },
  creditBanner: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.headerBorder,
    backgroundColor: theme.background,
  },
  creditBannerText: { fontSize: 15, fontWeight: '600', marginBottom: 10 },
  creditBannerBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  creditBannerBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  listContent: { padding: 16, paddingBottom: 20 },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 20,
    marginBottom: 12,
  },
  userBubble: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  aiBubble: { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  messageText: { fontSize: 16, lineHeight: 22 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
    borderTopWidth: 1,
    gap: 12,
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
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
