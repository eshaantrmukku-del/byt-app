import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type Props = {
  visible: boolean;
  initialTitle: string;
  onClose: () => void;
  onSave: (title: string) => void;
};

export function RenameChatModal({ visible, initialTitle, onClose, onSave }: Props) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];
  const [draft, setDraft] = useState(initialTitle);

  useEffect(() => {
    if (visible) setDraft(initialTitle);
  }, [visible, initialTitle]);

  const handleSave = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSave(trimmed);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>Rename conversation</Text>
          <TextInput
            style={[
              styles.input,
              {
                color: theme.text,
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
            value={draft}
            onChangeText={setDraft}
            placeholder="Conversation name"
            placeholderTextColor={theme.textSecondary}
            autoFocus
            maxLength={80}
            selectTextOnFocus
          />
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.btnCancel, { borderColor: theme.border }]} onPress={onClose}>
              <Text style={[styles.btnCancelText, { color: theme.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnSave, { backgroundColor: theme.primary }]}
              onPress={handleSave}
              disabled={!draft.trim()}
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
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    zIndex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnCancel: {
    borderWidth: 1,
  },
  btnCancelText: {
    fontWeight: '600',
    fontSize: 16,
  },
  btnSave: {},
  btnSaveText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
