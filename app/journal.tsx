import { router } from 'expo-router';
import { ChevronLeft, Save } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { friendlyError } from '@/features/auth/authErrors';
import { JOURNAL_TEXT_LIMIT, prepareJournalText, sortJournal } from '@/features/journal/journal';
import { addJournalEntry } from '@/services/journalService';
import { useAuthStore } from '@/stores/authStore';
import { useUserDataStore } from '@/stores/userDataStore';
import { theme } from '@/ui';

export default function JournalScreen() {
  const uid = useAuthStore((s) => s.user?.uid);
  const latest = useUserDataStore((s) => sortJournal(s.journal.items)[0]);
  const [entry, setEntry] = useState(latest?.text ?? '');
  const [touched, setTouched] = useState(false);
  const [shownId, setShownId] = useState(latest?.id ?? null);
  const [saving, setSaving] = useState(false);

  // Entries can arrive from the cloud after the screen opens; show the latest unless the user is typing.
  if (latest && shownId !== latest.id && !touched) {
    setShownId(latest.id);
    setEntry(latest.text);
  }

  const handleSave = async () => {
    const text = prepareJournalText(entry);
    if (!uid || !text || text === latest?.text) {
      router.back();
      return;
    }
    setSaving(true);
    try {
      await addJournalEntry(uid, text);
      router.back();
    } catch (e) {
      Alert.alert('Could not save', friendlyError(e, 'Check your connection and try again.'));
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back">
          <ChevronLeft size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Journal</Text>
        <TouchableOpacity
          onPress={() => void handleSave()}
          style={styles.saveButton}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Save"
        >
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Save size={20} color="#fff" />}
          <Text style={styles.saveButtonText}>Save</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.flex} contentContainerStyle={styles.contentContainer} keyboardShouldPersistTaps="handled">
          <View style={styles.dateCard}>
            <Text style={styles.dateText}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </Text>
            <Text style={styles.promptText}>What&apos;s on your mind today?</Text>
          </View>

          <TextInput
            style={styles.input}
            multiline
            placeholder="Start writing..."
            placeholderTextColor="#94A3B8"
            accessibilityLabel="Journal entry"
            value={entry}
            onChangeText={(text) => {
              setTouched(true);
              setEntry(text);
            }}
            maxLength={JOURNAL_TEXT_LIMIT}
            textAlignVertical="top"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  backButton: { padding: 8, marginLeft: -8 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 4,
  },
  saveButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  contentContainer: { padding: 24, flexGrow: 1 },
  dateCard: { marginBottom: 20 },
  dateText: { fontSize: 14, fontWeight: '600', color: '#94A3B8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 },
  promptText: { fontSize: 24, fontWeight: '700', color: theme.text },
  input: { flex: 1, fontSize: 16, color: theme.text, lineHeight: 24, minHeight: 300, textAlignVertical: 'top' },
});
