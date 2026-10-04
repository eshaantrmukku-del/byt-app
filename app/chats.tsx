import { router } from 'expo-router';
import { ChevronLeft, MessageSquare, Pencil, Plus, Trash2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { friendlyError } from '@/features/auth/authErrors';
import { formatRelativeTime, sortConversations } from '@/features/chat/chat';
import { createConversation, deleteConversation, renameConversation } from '@/services/conversationsService';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { useUserDataStore } from '@/stores/userDataStore';
import type { Conversation } from '@/types/models';
import { theme } from '@/ui';
import { RenameChatModal } from '@/ui/RenameChatModal';

export default function ChatsScreen() {
  const uid = useAuthStore((s) => s.user?.uid);
  const { status, items, error } = useUserDataStore((s) => s.conversations);
  const setActive = useChatStore((s) => s.setActive);
  const chats = useMemo(() => sortConversations(items), [items]);
  const [renaming, setRenaming] = useState<Conversation | null>(null);

  const open = (id: string) => {
    setActive(id);
    router.push({ pathname: '/ai-coach', params: { id } });
  };

  const startNew = () => {
    if (uid) open(createConversation(uid));
  };

  const remove = (chat: Conversation) => {
    if (!uid) return;
    const run = () =>
      void deleteConversation(uid, chat.id).catch((e) => Alert.alert('Couldn’t delete', friendlyError(e)));
    if (Platform.OS === 'web') return run();
    Alert.alert('Delete conversation?', `“${chat.title}” will be removed for good.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: run },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back">
          <ChevronLeft size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chat History</Text>
        <TouchableOpacity onPress={startNew} style={styles.backButton} accessibilityRole="button" accessibilityLabel="New conversation">
          <Plus size={24} color={theme.text} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={chats}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.chatItem}
            onPress={() => open(item.id)}
            onLongPress={() => setRenaming(item)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.title}`}
          >
            <View style={styles.chatIconContainer}>
              <MessageSquare size={24} color={theme.primary} />
            </View>
            <View style={styles.chatContent}>
              <Text style={styles.chatTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.chatPreview} numberOfLines={1}>
                {item.lastMessagePreview || 'New session — tap to start'}
              </Text>
              <Text style={styles.chatTime}>{formatRelativeTime(item.updatedAt)}</Text>
            </View>
            <View style={styles.actionsCol}>
              <TouchableOpacity
                onPress={() => setRenaming(item)}
                style={styles.actionButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`Rename ${item.title}`}
              >
                <Pencil size={18} color={theme.primary} />
              </TouchableOpacity>
              {chats.length > 1 ? (
                <TouchableOpacity
                  onPress={() => remove(item)}
                  style={styles.actionButton}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${item.title}`}
                >
                  <Trash2 size={18} color="#EF4444" />
                </TouchableOpacity>
              ) : null}
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {status === 'loading' ? (
              <ActivityIndicator color={theme.textSecondary} />
            ) : (
              <>
                <MessageSquare size={48} color={theme.tabIconDefault} />
                <Text style={styles.emptyText}>{status === 'unavailable' ? 'Couldn’t load chats' : 'No chats yet'}</Text>
                <Text style={styles.emptySubtext}>
                  {status === 'unavailable' ? error : 'Start a new conversation with your AI coach'}
                </Text>
                {status !== 'unavailable' ? (
                  <TouchableOpacity style={styles.startButton} onPress={startNew} accessibilityRole="button">
                    <Text style={styles.startButtonText}>Start a conversation</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            )}
          </View>
        }
      />

      <RenameChatModal
        visible={renaming !== null}
        initialTitle={renaming?.title ?? ''}
        onClose={() => setRenaming(null)}
        onSave={(title) => {
          if (uid && renaming) void renameConversation(uid, renaming.id, title).catch(() => undefined);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  backButton: { padding: 8, marginLeft: -8, marginRight: -8 },
  headerTitle: { fontSize: 18, fontWeight: '600', color: theme.text },
  listContainer: { padding: 24, flexGrow: 1 },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  chatIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  chatContent: { flex: 1, minWidth: 0 },
  chatTitle: { fontSize: 16, fontWeight: '600', color: theme.text, marginBottom: 4 },
  chatPreview: { fontSize: 14, color: theme.tabIconDefault, marginBottom: 4 },
  chatTime: { fontSize: 12, color: theme.tabIconDefault },
  actionsCol: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 8 },
  actionButton: { padding: 8 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100 },
  emptyText: { fontSize: 18, fontWeight: '600', color: theme.text, marginTop: 16 },
  emptySubtext: { fontSize: 14, color: theme.tabIconDefault, marginTop: 8, textAlign: 'center' },
  startButton: { marginTop: 20, backgroundColor: theme.primary, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 14 },
  startButtonText: { color: '#fff', fontWeight: '700' },
});
