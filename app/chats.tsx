import { RenameChatModal } from '@/components/RenameChatModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, MessageSquare, Pencil, Trash2 } from 'lucide-react-native';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useChats } from '@/context/ChatsContext';

export default function ChatsScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? 'light'];
    const { chats, setActiveChat, deleteChat, updateChatTitle } = useChats();

    const [renameChatId, setRenameChatId] = useState<string | null>(null);
    const renameChat = renameChatId ? chats.find((c) => c.id === renameChatId) : null;

    const handleChatPress = (chatId: string) => {
        setActiveChat(chatId);
        router.push('/ai-coach');
    };

    const handleDeleteChat = (chatId: string, e: { stopPropagation?: () => void }) => {
        e.stopPropagation?.();
        if (chats.length > 1) {
            deleteChat(chatId);
        }
    };

    const openRename = (chatId: string, e: { stopPropagation?: () => void }) => {
        e.stopPropagation?.();
        setRenameChatId(chatId);
    };

    const formatDate = (timestamp: number) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    const styles = getStyles(theme);

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ChevronLeft size={24} color={theme.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Chat History</Text>
                <View style={{ width: 40 }} />
            </View>

            <FlatList
                data={chats}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContainer}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={styles.chatItem}
                        onPress={() => handleChatPress(item.id)}
                        onLongPress={() => setRenameChatId(item.id)}
                    >
                        <View style={styles.chatIconContainer}>
                            <MessageSquare size={24} color={theme.primary} />
                        </View>
                        <View style={styles.chatContent}>
                            <Text style={styles.chatTitle} numberOfLines={1}>
                                {item.title}
                            </Text>
                            <Text style={styles.chatPreview} numberOfLines={1}>
                                {item.messages.length === 0
                                    ? 'New session — opening message loading…'
                                    : item.messages[item.messages.length - 1]?.text || 'No messages'}
                            </Text>
                            <Text style={styles.chatTime}>
                                {formatDate(item.updatedAt)}
                            </Text>
                        </View>
                        <View style={styles.actionsCol}>
                            <TouchableOpacity
                                onPress={(e) => openRename(item.id, e)}
                                style={styles.actionButton}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                                <Pencil size={18} color={theme.primary} />
                            </TouchableOpacity>
                            {chats.length > 1 && (
                                <TouchableOpacity
                                    onPress={(e) => handleDeleteChat(item.id, e)}
                                    style={styles.actionButton}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                    <Trash2 size={18} color="#EF4444" />
                                </TouchableOpacity>
                            )}
                        </View>
                    </TouchableOpacity>
                )}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <MessageSquare size={48} color={theme.tabIconDefault} />
                        <Text style={styles.emptyText}>No chats yet</Text>
                        <Text style={styles.emptySubtext}>Start a new conversation with your AI coach</Text>
                    </View>
                }
            />

            <RenameChatModal
                visible={renameChatId !== null}
                initialTitle={renameChat?.title ?? ''}
                onClose={() => setRenameChatId(null)}
                onSave={(title) => {
                    if (renameChatId) updateChatTitle(renameChatId, title);
                }}
            />
        </SafeAreaView>
    );
}

const getStyles = (theme: typeof Colors.light) =>
    StyleSheet.create({
        safeArea: {
            flex: 1,
            backgroundColor: theme.background,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 24,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
        },
        backButton: {
            padding: 8,
            marginLeft: -8,
        },
        headerTitle: {
            fontSize: 18,
            fontWeight: '600',
            color: theme.text,
        },
        listContainer: {
            padding: 24,
        },
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
        chatContent: {
            flex: 1,
            minWidth: 0,
        },
        chatTitle: {
            fontSize: 16,
            fontWeight: '600',
            color: theme.text,
            marginBottom: 4,
        },
        chatPreview: {
            fontSize: 14,
            color: theme.tabIconDefault,
            marginBottom: 4,
        },
        chatTime: {
            fontSize: 12,
            color: theme.tabIconDefault,
        },
        actionsCol: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            marginLeft: 8,
        },
        actionButton: {
            padding: 8,
        },
        emptyContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            paddingTop: 100,
        },
        emptyText: {
            fontSize: 18,
            fontWeight: '600',
            color: theme.text,
            marginTop: 16,
        },
        emptySubtext: {
            fontSize: 14,
            color: theme.tabIconDefault,
            marginTop: 8,
            textAlign: 'center',
        },
    });
