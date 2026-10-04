import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useProfileStore } from '@/stores/profileStore';
import { AppText, Button, colors, radius, Screen, space } from '@/ui';

function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function Home() {
  const profile = useProfileStore((s) => s.profile);
  const firstName = profile?.displayName.split(' ')[0] ?? '';

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
        <AppText tone="secondary">
          Conversations with your coach open up in the next build. For now, make sure your profile feels right.
        </AppText>
        <Button label="Talk to your coach" onPress={() => undefined} disabled accessibilityHint="Coming soon" />
      </View>

      {profile?.goalsSummary ? (
        <View style={styles.section}>
          <AppText variant="overline" tone="muted">
            What you’re working towards
          </AppText>
          <AppText>{profile.goalsSummary}</AppText>
          <Button label="Edit profile" variant="secondary" onPress={() => router.push('/edit-profile')} />
        </View>
      ) : null}
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
});
