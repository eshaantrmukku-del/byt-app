import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { friendlyError } from '@/features/auth/authErrors';
import { logOut } from '@/services/authService';
import { useProfileStore } from '@/stores/profileStore';
import { useSyncStore } from '@/stores/syncStore';
import { AppText, Banner, Button, colors, ListRow, radius, Screen, space } from '@/ui';

export default function Settings() {
  const profile = useProfileStore((s) => s.profile);
  const syncError = useSyncStore((s) => s.lastError);
  const [loggingOut, setLoggingOut] = useState(false);

  const runLogout = async (force: boolean) => {
    setLoggingOut(true);
    try {
      const result = await logOut({ force });
      if (result === 'unsynced') {
        setLoggingOut(false);
        Alert.alert(
          'Some changes haven’t synced',
          'You seem to be offline. If you log out now, recent changes on this device will be lost.',
          [
            { text: 'Stay logged in', style: 'cancel' },
            { text: 'Log out anyway', style: 'destructive', onPress: () => void runLogout(true) },
          ]
        );
      }
    } catch (e) {
      setLoggingOut(false);
      Alert.alert('Couldn’t log out', friendlyError(e));
    }
  };

  return (
    <Screen scroll edges={['top']}>
      <AppText variant="title" style={styles.title}>
        Settings
      </AppText>

      {syncError ? (
        <View style={styles.banner}>
          <Banner message={syncError} />
        </View>
      ) : null}

      <AppText variant="overline" tone="muted" style={styles.sectionLabel}>
        Account
      </AppText>
      <View style={styles.group}>
        <ListRow icon="person-outline" label={profile?.displayName || 'Your profile'} detail={profile?.email} />
        <View style={styles.divider} />
        <ListRow icon="create-outline" label="Edit profile" onPress={() => router.push('/edit-profile')} />
      </View>

      <AppText variant="overline" tone="muted" style={styles.sectionLabel}>
        Plan
      </AppText>
      <View style={styles.group}>
        <ListRow
          icon="sparkles-outline"
          label="BYT Beta"
          detail="Coaching credits will show here once your coach is live."
        />
      </View>

      <View style={styles.logout}>
        <Button label="Log out" variant="danger" onPress={() => void runLogout(false)} loading={loggingOut} />
      </View>

      <AppText variant="caption" tone="muted" center style={styles.version}>
        BYT {Constants.expoConfig?.version ?? ''}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: space.xl },
  banner: { marginTop: space.lg },
  sectionLabel: { marginTop: space.xxl, marginBottom: space.sm },
  group: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 52 },
  logout: { marginTop: space.xxxl },
  version: { marginTop: space.xl },
});
