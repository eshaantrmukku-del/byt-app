import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import { friendlyError } from '@/features/auth/authErrors';
import {
  CATEGORY_LABELS,
  diffGoal,
  GOAL_TITLE_LIMIT,
  NEW_GOAL_DRAFT,
  normaliseProgress,
  resolveGoalDraft,
  STATUS_LABELS,
  type GoalDraft,
} from '@/features/goals/goals';
import { createGoal, deleteGoal, updateGoal } from '@/services/goalsService';
import { useAuthStore } from '@/stores/authStore';
import { useUserDataStore } from '@/stores/userDataStore';
import { GOAL_CATEGORIES, GOAL_STATUSES } from '@/types/models';
import {
  AppText,
  Banner,
  Button,
  Chip,
  colors,
  ProgressBar,
  radius,
  Screen,
  ScreenHeader,
  space,
  TextField,
  useDiscardGuard,
} from '@/ui';

const PROGRESS_STEPS = [0, 25, 50, 75, 100];

export default function GoalEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const uid = useAuthStore((s) => s.user?.uid);
  const goal = useUserDataStore((s) => s.goals.items.find((g) => g.id === id));
  const goalsStatus = useUserDataStore((s) => s.goals.status);

  const initial = useMemo<GoalDraft>(
    () => (goal ? { title: goal.title, category: goal.category, status: goal.status, progress: goal.progress } : NEW_GOAL_DRAFT),
    // Only the goal as it was when the screen opened; later cloud updates don't reset the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [goal?.id]
  );
  const [draft, setDraft] = useState<GoalDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => setDraft(initial), [initial]);
  useEffect(() => {
    if (done) router.back();
  }, [done]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  useDiscardGuard(dirty && !done);

  const set = <K extends keyof GoalDraft>(key: K, value: GoalDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  if (!isNew && !goal) {
    return (
      <Screen>
        <ScreenHeader title="Goal" />
        <View style={styles.missing}>
          <AppText tone="secondary" center>
            {goalsStatus === 'loading' ? 'Loading…' : 'This goal no longer exists.'}
          </AppText>
        </View>
      </Screen>
    );
  }

  const onSave = async () => {
    if (!uid) return;
    const resolved = resolveGoalDraft(draft);
    if (!resolved.ok) return setError(resolved.error);
    setError(null);
    setBusy('save');
    try {
      if (isNew) await createGoal(uid, resolved.goal);
      else await updateGoal(uid, id, diffGoal(initial, resolved.goal));
      setDone(true);
    } catch (e) {
      setError(friendlyError(e, 'We couldn’t save this goal. Please try again.'));
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!uid) return;
    setBusy('delete');
    try {
      await deleteGoal(uid, id);
      setDone(true);
    } catch (e) {
      setError(friendlyError(e, 'We couldn’t delete this goal. Please try again.'));
      setBusy(null);
    }
  };

  const onDelete = () => {
    if (Platform.OS === 'web') return void remove();
    Alert.alert('Delete this goal?', 'This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void remove() },
    ]);
  };

  return (
    <Screen
      scroll
      footer={
        <>
          <Button
            label={isNew ? 'Add goal' : 'Save changes'}
            onPress={onSave}
            loading={busy === 'save'}
            disabled={busy !== null || (!isNew && !dirty)}
          />
          {!isNew ? (
            <Button label="Delete goal" variant="ghost" onPress={onDelete} loading={busy === 'delete'} disabled={busy !== null} />
          ) : null}
        </>
      }
    >
      <ScreenHeader title={isNew ? 'New goal' : 'Edit goal'} />

      <View style={styles.form}>
        {error ? <Banner message={error} /> : null}

        <TextField
          label="What do you want to achieve?"
          value={draft.title}
          onChangeText={(v) => set('title', v)}
          placeholder="e.g. Run a half marathon"
          maxLength={GOAL_TITLE_LIMIT}
          autoFocus={isNew}
        />

        <View style={styles.group}>
          <AppText variant="label" tone="secondary">
            Area of life
          </AppText>
          <View style={styles.chips}>
            {GOAL_CATEGORIES.map((c) => (
              <Chip key={c} label={CATEGORY_LABELS[c]} selected={draft.category === c} onPress={() => set('category', c)} />
            ))}
          </View>
        </View>

        <View style={styles.group}>
          <View style={styles.progressHeader}>
            <AppText variant="label" tone="secondary">
              Progress
            </AppText>
            <AppText variant="bodyStrong">{draft.progress}%</AppText>
          </View>
          <ProgressBar value={draft.progress} muted={draft.status === 'paused'} />
          <View style={styles.stepper}>
            <Button
              label="−10"
              variant="secondary"
              onPress={() => set('progress', normaliseProgress(draft.progress - 10))}
              style={styles.stepButton}
            />
            {PROGRESS_STEPS.map((p) => (
              <Chip
                key={p}
                label={`${p}`}
                accessibilityLabel={`Set progress to ${p}%`}
                selected={draft.progress === p}
                onPress={() => set('progress', p)}
              />
            ))}
            <Button
              label="+10"
              variant="secondary"
              onPress={() => set('progress', normaliseProgress(draft.progress + 10))}
              style={styles.stepButton}
            />
          </View>
        </View>

        {!isNew ? (
          <View style={styles.group}>
            <AppText variant="label" tone="secondary">
              Status
            </AppText>
            <View style={styles.segment}>
              {GOAL_STATUSES.map((s) => (
                <Chip key={s} label={STATUS_LABELS[s]} selected={draft.status === s} onPress={() => set('status', s)} />
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  missing: { flex: 1, justifyContent: 'center' },
  form: { marginTop: space.xl, gap: space.xl },
  group: { gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  stepper: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  stepButton: { minHeight: 36, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: colors.surface },
  segment: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
});
