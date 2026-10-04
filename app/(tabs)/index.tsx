import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { computeStreaks } from '@/features/checkIns/checkIns';
import { localDateKey } from '@/features/dates';
import { sortGoals } from '@/features/goals/goals';
import { useProfileStore } from '@/stores/profileStore';
import { useUserDataStore } from '@/stores/userDataStore';
import { AppText, Button, Card, colors, ProgressBar, radius, Screen, space } from '@/ui';

function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function TodayRow(props: {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  detail: string;
  done?: boolean;
  onPress: () => void;
}) {
  return (
    <Card onPress={props.onPress} accessibilityLabel={`${props.title}. ${props.detail}`} style={styles.row}>
      <View style={[styles.rowIcon, props.done && styles.rowIconDone]}>
        <Ionicons name={props.done ? 'checkmark' : props.icon} size={18} color={props.done ? colors.onAccent : colors.accent} />
      </View>
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{props.title}</AppText>
        <AppText variant="caption" tone="secondary">
          {props.detail}
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Card>
  );
}

export default function Home() {
  const profile = useProfileStore((s) => s.profile);
  const checkIns = useUserDataStore((s) => s.checkIns.items);
  const goals = useUserDataStore((s) => s.goals.items);
  const firstName = profile?.displayName.split(' ')[0] ?? '';

  const today = localDateKey();
  const streaks = computeStreaks(
    checkIns.map((c) => c.id),
    today
  );
  const activeGoals = sortGoals(goals).filter((g) => g.status === 'active').slice(0, 3);

  const checkInDetail = streaks.checkedInToday
    ? `Done for today · ${streaks.current}-day streak`
    : streaks.current > 0
      ? `Keep your ${streaks.current}-day streak going`
      : 'Mood, energy, stress and sleep';

  return (
    <Screen scroll edges={['top']}>
      <View style={styles.header}>
        <AppText variant="overline" tone="muted">
          {greeting()}
        </AppText>
        <AppText variant="display">{firstName || 'Welcome'}</AppText>
      </View>

      <View style={styles.coach}>
        <AppText variant="overline" tone="accent">
          Your coach
        </AppText>
        <AppText variant="heading">What’s on your mind today?</AppText>
        <AppText tone="secondary">Conversations with your coach open up in an upcoming build.</AppText>
        <Button label="Talk to your coach" onPress={() => undefined} disabled accessibilityHint="Coming soon" />
      </View>

      <View style={styles.section}>
        <AppText variant="overline" tone="muted">
          Today
        </AppText>
        <TodayRow
          icon="pulse-outline"
          title={streaks.checkedInToday ? 'Checked in' : 'Daily check-in'}
          detail={checkInDetail}
          done={streaks.checkedInToday}
          onPress={() => router.push('/check-in')}
        />
        <TodayRow icon="book-outline" title="Journal" detail="Private space to think on paper" onPress={() => router.push('/journal')} />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <AppText variant="overline" tone="muted">
            Working towards
          </AppText>
          <Button label="All goals" variant="ghost" onPress={() => router.push('/goals')} style={styles.linkButton} />
        </View>
        {activeGoals.length > 0 ? (
          activeGoals.map((g) => (
            <Card
              key={g.id}
              onPress={() => router.push({ pathname: '/goal/[id]', params: { id: g.id } })}
              accessibilityLabel={`${g.title}, ${g.progress}%`}
            >
              <View style={styles.goalTop}>
                <AppText variant="bodyStrong" style={styles.flex}>
                  {g.title}
                </AppText>
                <AppText variant="label" tone="secondary">
                  {g.progress}%
                </AppText>
              </View>
              <ProgressBar value={g.progress} />
            </Card>
          ))
        ) : (
          <Card onPress={() => router.push('/goal/new')} accessibilityLabel="Add a goal">
            <AppText>{profile?.goalsSummary || 'What do you want to move forward?'}</AppText>
            <AppText variant="caption" tone="accent">
              Turn this into a goal you can track →
            </AppText>
          </Card>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: space.xl, gap: space.xs },
  coach: {
    marginTop: space.xxl,
    padding: space.xl,
    gap: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  section: { marginTop: space.xxl, gap: space.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  linkButton: { minHeight: 32, paddingHorizontal: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  rowIconDone: { backgroundColor: colors.accent },
  goalTop: { flexDirection: 'row', gap: space.md },
  flex: { flex: 1 },
});
