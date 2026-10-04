import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, View } from 'react-native';

import { friendlyError } from '@/features/auth/authErrors';
import { formatDayLabel, formatTime } from '@/features/dates';
import { JOURNAL_TEXT_LIMIT, prepareJournalText, sortJournal } from '@/features/journal/journal';
import { addJournalEntry, deleteJournalEntry, updateJournalEntry } from '@/services/journalService';
import { retryUserData } from '@/services/session';
import { useAuthStore } from '@/stores/authStore';
import { useUserDataStore } from '@/stores/userDataStore';
import type { JournalEntry } from '@/types/models';
import { AppText, Banner, Button, Card, colors, Screen, ScreenHeader, space, TextField, useDiscardGuard } from '@/ui';

export default function Journal() {
  const uid = useAuthStore((s) => s.user?.uid);
  const { status, items, error: loadError } = useUserDataStore((s) => s.journal);
  const entries = sortJournal(items);

  const [text, setText] = useState('');
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const original = editing?.text ?? '';
  const dirty = text.trim() !== original.trim();
  useDiscardGuard(dirty && !busy);

  const reset = () => {
    setText('');
    setEditing(null);
    setError(null);
  };

  const onSave = async () => {
    if (!uid || !prepareJournalText(text)) return;
    setBusy(true);
    setError(null);
    try {
      const write = editing ? updateJournalEntry(uid, editing.id, text) : addJournalEntry(uid, text);
      await write;
      reset();
    } catch (e) {
      setError(friendlyError(e, 'We couldn’t save your entry. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (entry: JournalEntry) => {
    if (!uid) return;
    setBusy(true);
    try {
      await deleteJournalEntry(uid, entry.id);
      reset();
    } catch (e) {
      setError(friendlyError(e, 'We couldn’t delete that entry. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = (entry: JournalEntry) => {
    if (Platform.OS === 'web') return void remove(entry);
    Alert.alert('Delete this entry?', 'This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void remove(entry) },
    ]);
  };

  const startEditing = (entry: JournalEntry) => {
    setEditing(entry);
    setText(entry.text);
    setError(null);
  };

  return (
    <Screen scroll>
      <ScreenHeader title="Journal" />
      <AppText tone="secondary" style={styles.intro}>
        Private to you. Write freely — nothing here is shared.
      </AppText>

      <View style={styles.composer}>
        {error ? <Banner message={error} /> : null}
        <TextField
          label={editing ? `Editing · ${formatDayLabel(editing.date)} ${formatTime(editing.createdAt)}` : 'New entry'}
          value={text}
          onChangeText={setText}
          placeholder="What’s on your mind?"
          maxLength={JOURNAL_TEXT_LIMIT}
          multiline
        />
        <View style={styles.actions}>
          {editing ? (
            <>
              <Button label="Cancel" variant="ghost" onPress={reset} disabled={busy} style={styles.flex} />
              <Button label="Delete" variant="danger" onPress={() => onDelete(editing)} disabled={busy} style={styles.flex} />
            </>
          ) : null}
          <Button
            label={editing ? 'Save' : 'Save entry'}
            onPress={onSave}
            loading={busy}
            disabled={!prepareJournalText(text) || (!!editing && !dirty)}
            style={styles.flex}
          />
        </View>
      </View>

      <View style={styles.list}>
        {status === 'loading' ? (
          <ActivityIndicator color={colors.textSecondary} />
        ) : status === 'unavailable' && loadError ? (
          <View style={styles.list}>
            <Banner message={loadError} />
            <Button label="Try again" variant="secondary" onPress={retryUserData} />
          </View>
        ) : entries.length === 0 ? (
          <AppText tone="muted" center>
            Your entries will appear here.
          </AppText>
        ) : (
          entries.map((entry) => (
            <Card
              key={entry.id}
              onPress={() => startEditing(entry)}
              accessibilityLabel={`Journal entry, ${formatDayLabel(entry.date)}`}
              style={editing?.id === entry.id ? styles.editingCard : undefined}
            >
              <AppText variant="caption" tone="muted">
                {formatDayLabel(entry.date)} · {formatTime(entry.createdAt)}
              </AppText>
              <AppText>{entry.text}</AppText>
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { marginTop: space.lg },
  composer: { marginTop: space.xl, gap: space.md },
  actions: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
  list: { marginTop: space.xxl, gap: space.md },
  editingCard: { borderColor: colors.accent },
});
