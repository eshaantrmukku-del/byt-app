import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { CATEGORY_LABELS, sortGoals, STATUS_LABELS } from '@/features/goals/goals';
import { retryUserData } from '@/services/session';
import { useUserDataStore } from '@/stores/userDataStore';
import type { Goal, GoalStatus } from '@/types/models';
import { AppText, Banner, Button, Card, colors, ProgressBar, Screen, space } from '@/ui';

const SECTIONS: { status: GoalStatus; title: string }[] = [
  { status: 'active', title: 'In progress' },
  { status: 'paused', title: 'Paused' },
  { status: 'completed', title: 'Completed' },
];

function GoalCard({ goal }: { goal: Goal }) {
  return (
    <Card
      onPress={() => router.push({ pathname: '/goal/[id]', params: { id: goal.id } })}
      accessibilityLabel={`${goal.title}, ${goal.progress}% , ${STATUS_LABELS[goal.status]}`}
    >
      <View style={styles.cardTop}>
        <AppText variant="bodyStrong" style={styles.flex}>
          {goal.title}
        </AppText>
        <AppText variant="label" tone={goal.status === 'completed' ? 'accent' : 'secondary'}>
          {goal.progress}%
        </AppText>
      </View>
      <ProgressBar value={goal.progress} muted={goal.status === 'paused'} />
      <AppText variant="caption" tone="muted">
        {CATEGORY_LABELS[goal.category]}
      </AppText>
    </Card>
  );
}

export default function Goals() {
  const { status, items, error } = useUserDataStore((s) => s.goals);
  const goals = sortGoals(items);

  return (
    <Screen scroll edges={['top']}>
      <View style={styles.header}>
        <AppText variant="title">Goals</AppText>
        <Button label="New goal" variant="secondary" onPress={() => router.push('/goal/new')} style={styles.newButton} />
      </View>

      {status === 'loading' ? (
        <ActivityIndicator color={colors.textSecondary} style={styles.loading} />
      ) : status === 'unavailable' && error && goals.length === 0 ? (
        <View style={styles.section}>
          <Banner message={error} />
          <Button label="Try again" variant="secondary" onPress={retryUserData} />
        </View>
      ) : goals.length === 0 ? (
        <View style={styles.empty}>
          <AppText variant="heading" center>
            What do you want to move forward?
          </AppText>
          <AppText tone="secondary" center>
            Add a goal and track how it’s going. Your coach will use it as context when it’s relevant.
          </AppText>
          <Button label="Add your first goal" onPress={() => router.push('/goal/new')} />
        </View>
      ) : (
        SECTIONS.map(({ status: s, title }) => {
          const group = goals.filter((g) => g.status === s);
          if (group.length === 0) return null;
          return (
            <View key={s} style={styles.section}>
              <AppText variant="overline" tone="muted">
                {title}
              </AppText>
              {group.map((goal) => (
                <GoalCard key={goal.id} goal={goal} />
              ))}
            </View>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: space.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  newButton: { minHeight: 40, paddingHorizontal: space.lg },
  loading: { marginTop: space.xxxl },
  empty: { marginTop: space.xxxl, gap: space.lg },
  section: { marginTop: space.xxl, gap: space.md },
  cardTop: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  flex: { flex: 1 },
});
