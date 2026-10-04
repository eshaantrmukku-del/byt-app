import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { CONVERSATION_TITLE_LIMIT } from '@/features/chat/chat';

import { theme } from './theme';

type Props = { visible: boolean; initialTitle: string; onClose: () => void; onSave: (title: string) => void };

export function RenameChatModal({ visible, initialTitle, onClose, onSave }: Props) {
  if (!visible) return null;
  return <RenameSheet initialTitle={initialTitle} onClose={onClose} onSave={onSave} />;
}

function RenameSheet({ initialTitle, onClose, onSave }: Omit<Props, 'visible'>) {
  const [draft, setDraft] = useState(initialTitle);

  const handleSave = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSave(trimmed);
    onClose();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <Text style={styles.title}>Rename conversation</Text>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Conversation name"
            placeholderTextColor={theme.textSecondary}
            accessibilityLabel="Conversation name"
            autoFocus
            maxLength={CONVERSATION_TITLE_LIMIT}
            selectTextOnFocus
            onSubmitEditing={handleSave}
          />
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={onClose} accessibilityRole="button">
              <Text style={styles.btnCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnSave, !draft.trim() && styles.disabled]}
              onPress={handleSave}
              disabled={!draft.trim()}
              accessibilityRole="button"
              accessibilityLabel="Save name"
            >
              <Text style={styles.btnSaveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: 24 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { borderRadius: 20, padding: 24, borderWidth: 1, zIndex: 1, backgroundColor: theme.card, borderColor: theme.border },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 16, color: theme.text },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 20,
    color: theme.text,
    backgroundColor: theme.surface,
    borderColor: theme.border,
  },
  actions: { flexDirection: 'row', gap: 12 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  btnCancel: { borderWidth: 1, borderColor: theme.border },
  btnCancelText: { fontWeight: '600', fontSize: 16, color: theme.text },
  btnSave: { backgroundColor: theme.primary },
  disabled: { opacity: 0.5 },
  btnSaveText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
