import { CheckCircle, Circle, Plus, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { friendlyError } from '@/features/auth/authErrors';
import {
  CATEGORY_LABELS,
  diffGoal,
  GOAL_TITLE_LIMIT,
  NEW_GOAL_DRAFT,
  normaliseProgress,
  PICKABLE_CATEGORIES,
  resolveGoalDraft,
  type GoalDraft,
} from '@/features/goals/goals';
import { createGoal, deleteGoal, updateGoal } from '@/services/goalsService';
import { retryUserData } from '@/services/session';
import { useAuthStore } from '@/stores/authStore';
import { useUserDataStore } from '@/stores/userDataStore';
import type { Goal } from '@/types/models';
import { theme } from '@/ui';

const FILTERS = ['All', 'Active', 'Completed'] as const;
type Filter = (typeof FILTERS)[number];

const PROGRESS_PRESETS = [0, 25, 50, 75, 100];

const byCreated = (a: Goal, b: Goal) => a.createdAt - b.createdAt;

export default function GoalsScreen() {
  const uid = useAuthStore((s) => s.user?.uid);
  const { status, items, error } = useUserDataStore((s) => s.goals);
  const [filter, setFilter] = useState<Filter>('All');
  const [editing, setEditing] = useState<Goal | 'new' | null>(null);

  const filtered = useMemo(() => {
    const sorted = [...items].sort(byCreated);
    if (filter === 'Active') return sorted.filter((g) => g.status !== 'completed');
    if (filter === 'Completed') return sorted.filter((g) => g.status === 'completed');
    return sorted;
  }, [items, filter]);

  const toggleStatus = async (goal: Goal) => {
    if (!uid) return;
    const completing = goal.status !== 'completed';
    try {
      await updateGoal(uid, goal.id, completing ? { status: 'completed', progress: 100 } : { status: 'active', progress: 0 });
    } catch (e) {
      Alert.alert('Could not update goal', friendlyError(e));
    }
  };

  const renderGoal = ({ item }: { item: Goal }) => {
    const done = item.status === 'completed';
    return (
      <TouchableOpacity
        style={styles.goalCard}
        activeOpacity={0.85}
        onPress={() => setEditing(item)}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}, ${item.progress}%`}
      >
        <View style={styles.goalHeader}>
          <View style={styles.flex}>
            <Text style={styles.goalCategory}>{CATEGORY_LABELS[item.category]}</Text>
            <Text style={styles.goalTitle}>{item.title}</Text>
          </View>
          <TouchableOpacity
            onPress={() => void toggleStatus(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: done }}
            accessibilityLabel={done ? `Mark ${item.title} as active` : `Mark ${item.title} as completed`}
          >
            {done ? <CheckCircle size={24} color={theme.primary} /> : <Circle size={24} color={theme.icon} />}
          </TouchableOpacity>
        </View>
        <View style={styles.progressContainer}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${item.progress}%` }]} />
          </View>
          <Text style={styles.progressText}>{item.progress}%</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>My Goals</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setEditing('new')} accessibilityRole="button" accessibilityLabel="New goal">
          <Plus size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.filterContainer}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === f }}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        renderItem={renderGoal}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {status === 'loading' ? (
              <ActivityIndicator color={theme.textSecondary} />
            ) : status === 'unavailable' && error ? (
              <>
                <Text style={styles.emptyText}>{error}</Text>
                <TouchableOpacity onPress={retryUserData} style={styles.retry}>
                  <Text style={styles.retryText}>Try again</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={styles.emptyText}>No goals found. Start by adding one!</Text>
            )}
          </View>
        }
      />

      {editing ? (
        <GoalSheet key={editing === 'new' ? 'new' : editing.id} uid={uid} goal={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      ) : null}
    </SafeAreaView>
  );
}

function GoalSheet({ uid, goal, onClose }: { uid: string | undefined; goal: Goal | null; onClose: () => void }) {
  const initial: GoalDraft = goal
    ? { title: goal.title, category: goal.category, status: goal.status, progress: goal.progress }
    : NEW_GOAL_DRAFT;
  const [draft, setDraft] = useState<GoalDraft>(initial);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof GoalDraft>(key: K, value: GoalDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const handleSave = async () => {
    if (!uid) return;
    const resolved = resolveGoalDraft(draft);
    if (!resolved.ok) {
      // The prototype ignored taps with an empty title; keep that, but explain other problems.
      if (draft.title.trim()) Alert.alert('Goal', resolved.error);
      return;
    }
    setBusy(true);
    try {
      if (goal) await updateGoal(uid, goal.id, diffGoal(initial, resolved.goal));
      else await createGoal(uid, resolved.goal);
      onClose();
    } catch (e) {
      Alert.alert('Could not save goal', friendlyError(e));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!uid || !goal) return;
    setBusy(true);
    try {
      await deleteGoal(uid, goal.id);
      onClose();
    } catch (e) {
      Alert.alert('Could not delete goal', friendlyError(e));
      setBusy(false);
    }
  };

  const confirmDelete = () => {
    if (Platform.OS === 'web') return void remove();
    Alert.alert('Delete goal?', 'This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void remove() },
    ]);
  };

  return (
    <Modal animationType="slide" transparent statusBarTranslucent visible onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} accessibilityLabel="Close" />
        <KeyboardAvoidingView behavior="padding" style={styles.modalSheetWrap}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{goal ? 'Edit Goal' : 'New Goal'}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
                <X size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bounces={false}>
              <Text style={styles.label}>Goal Title</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Run a 5k Marathon"
                placeholderTextColor="#9CA3AF"
                accessibilityLabel="Goal Title"
                value={draft.title}
                onChangeText={(t) => set('title', t)}
                maxLength={GOAL_TITLE_LIMIT}
                returnKeyType="done"
              />

              <Text style={styles.label}>Category</Text>
              <View style={styles.categoryContainer}>
                {PICKABLE_CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.categoryChip, draft.category === cat && styles.categoryChipActive]}
                    onPress={() => set('category', cat)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: draft.category === cat }}
                  >
                    <Text style={[styles.categoryText, draft.category === cat && styles.categoryTextActive]}>
                      {CATEGORY_LABELS[cat]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {goal ? (
                <>
                  <View style={styles.progressLabelRow}>
                    <Text style={styles.label}>Progress</Text>
                    <Text style={styles.progressValue}>{draft.progress}%</Text>
                  </View>
                  <View style={[styles.progressBarBg, styles.sheetProgress]}>
                    <View style={[styles.progressBarFill, { width: `${draft.progress}%` }]} />
                  </View>
                  <View style={styles.presetRow}>
                    {PROGRESS_PRESETS.map((p) => (
                      <TouchableOpacity
                        key={p}
                        style={[styles.presetChip, draft.progress === p && styles.categoryChipActive]}
                        onPress={() => setDraft((d) => ({ ...d, progress: p, status: p === 100 ? 'completed' : 'active' }))}
                        accessibilityRole="button"
                        accessibilityLabel={`Set progress to ${p}%`}
                      >
                        <Text style={[styles.categoryText, draft.progress === p && styles.categoryTextActive]}>{p}%</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.presetRow}>
                    {[-10, 10].map((delta) => (
                      <TouchableOpacity
                        key={delta}
                        style={[styles.presetChip, styles.stepChip]}
                        onPress={() =>
                          setDraft((d) => {
                            const progress = normaliseProgress(d.progress + delta);
                            return { ...d, progress, status: progress === 100 ? 'completed' : 'active' };
                          })
                        }
                        accessibilityRole="button"
                        accessibilityLabel={delta > 0 ? 'Increase progress by 10%' : 'Decrease progress by 10%'}
                      >
                        <Text style={styles.categoryText}>{delta > 0 ? '+10%' : '−10%'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              ) : null}

              <TouchableOpacity
                style={[styles.saveButton, busy && styles.busy]}
                onPress={() => void handleSave()}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={goal ? 'Save Goal' : 'Create Goal'}
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>{goal ? 'Save Goal' : 'Create Goal'}</Text>}
              </TouchableOpacity>

              {goal ? (
                <TouchableOpacity style={styles.deleteButton} onPress={confirmDelete} disabled={busy} accessibilityRole="button">
                  <Text style={styles.deleteText}>Delete Goal</Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  flex: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingBottom: 16 },
  title: { fontSize: 28, fontWeight: 'bold', color: theme.text },
  addButton: { backgroundColor: theme.primary, padding: 10, borderRadius: 20 },
  filterContainer: { flexDirection: 'row', paddingHorizontal: 24, marginBottom: 16, gap: 12 },
  filterChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
  },
  filterChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  filterText: { color: theme.text, fontWeight: '600' },
  filterTextActive: { color: '#FFFFFF' },
  listContent: { paddingHorizontal: 24, paddingBottom: 100 },
  goalCard: {
    backgroundColor: theme.card,
    padding: 20,
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  goalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  goalCategory: { fontSize: 12, color: theme.primary, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  goalTitle: { fontSize: 18, fontWeight: 'bold', color: theme.text },
  progressContainer: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  progressBarBg: { flex: 1, height: 8, backgroundColor: theme.surface, borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: theme.primary, borderRadius: 4 },
  progressText: { fontSize: 14, fontWeight: '600', color: theme.primary },
  emptyContainer: { alignItems: 'center', marginTop: 40, gap: 12 },
  emptyText: { color: theme.icon, fontSize: 16, textAlign: 'center' },
  retry: { paddingVertical: 8, paddingHorizontal: 16 },
  retryText: { color: theme.primary, fontWeight: '600' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheetWrap: { width: '100%', maxHeight: '88%' },
  modalContent: {
    backgroundColor: theme.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 32 : 24,
    zIndex: 2,
    elevation: 8,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 24, fontWeight: 'bold', color: theme.text },
  label: { fontSize: 16, fontWeight: '600', color: theme.text, marginBottom: 8 },
  input: {
    backgroundColor: theme.card,
    padding: 16,
    borderRadius: 16,
    fontSize: 16,
    color: theme.text,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 24,
  },
  categoryContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 32 },
  categoryChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
  },
  categoryChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  categoryText: { color: theme.text, fontWeight: '600' },
  categoryTextActive: { color: '#fff' },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  progressValue: { fontSize: 16, fontWeight: '700', color: theme.primary },
  sheetProgress: { flex: 0, marginBottom: 16 },
  presetRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  presetChip: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
  },
  stepChip: { marginBottom: 20 },
  saveButton: { backgroundColor: theme.primary, padding: 18, borderRadius: 16, alignItems: 'center' },
  busy: { opacity: 0.75 },
  saveButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  deleteButton: { paddingVertical: 16, alignItems: 'center' },
  deleteText: { color: '#F87171', fontSize: 16, fontWeight: '600' },
});
