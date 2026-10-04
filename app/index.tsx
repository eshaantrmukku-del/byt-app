import { router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, View } from 'react-native';

import { env } from '@/config/env';
import { useGate } from '@/features/session/useGate';
import { logOut } from '@/services/authService';
import { retryProfile } from '@/services/session';
import { useProfileStore } from '@/stores/profileStore';
import { AppText, Banner, Button, colors, Screen, space } from '@/ui';

const WORDS = ['Build', 'Your', 'Tomorrow'] as const;
const WORD_STAGGER_MS = 420;
const HOLD_MS = 650;

// The intro plays once per app launch; later visits (e.g. after logout) route straight through.
let introPlayed = false;

export default function Splash() {
  const gate = useGate();
  const profileError = useProfileStore((s) => s.error);
  const [introDone, setIntroDone] = useState(introPlayed);
  const [showSlowHint, setShowSlowHint] = useState(false);
  const values = useRef(WORDS.map(() => new Animated.Value(introPlayed ? 1 : 0))).current;

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => undefined);
    if (introPlayed) return;
    const animation = Animated.sequence([
      Animated.stagger(
        WORD_STAGGER_MS,
        values.map((v) =>
          Animated.timing(v, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true })
        )
      ),
      Animated.delay(HOLD_MS),
    ]);
    animation.start(() => {
      introPlayed = true;
      setIntroDone(true);
    });
    return () => animation.stop();
  }, [values]);

  useEffect(() => {
    if (!introDone) return;
    if (gate === 'signedOut') router.replace('/auth/login');
    else if (gate === 'onboarding') router.replace('/onboarding');
    else if (gate === 'ready') router.replace('/(tabs)');
  }, [introDone, gate]);

  useEffect(() => {
    if (!introDone) return;
    const t = setTimeout(() => setShowSlowHint(true), 1500);
    return () => clearTimeout(t);
  }, [introDone]);

  const waiting = introDone && (gate === 'booting' || gate === 'loadingProfile');

  return (
    <Screen contentStyle={styles.center}>
      <View style={styles.words}>
        {WORDS.map((word, i) => {
          const v = values[i]!;
          return (
            <Animated.Text
              key={word}
              style={[
                styles.word,
                i === 2 && styles.accentWord,
                {
                  opacity: v,
                  transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
                },
              ]}
            >
              {word}
            </Animated.Text>
          );
        })}
      </View>

      <View style={styles.status}>
        {!env.ok ? (
          <Banner message="BYT isn’t configured on this build. Check the Firebase settings in .env and restart." />
        ) : gate === 'profileUnavailable' && introDone ? (
          <View style={styles.errorBox}>
            <Banner message={profileError ?? 'We couldn’t load your account.'} />
            <Button label="Try again" onPress={retryProfile} />
            <Button label="Log out" variant="ghost" onPress={() => void logOut({ force: true })} />
          </View>
        ) : waiting && showSlowHint ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.textSecondary} />
            <AppText variant="caption" tone="muted">
              Loading your account…
            </AppText>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: 'center' },
  words: { gap: space.xs, paddingHorizontal: space.sm },
  word: { color: colors.text, fontSize: 44, lineHeight: 52, fontWeight: '700', letterSpacing: -1 },
  accentWord: { color: colors.accent },
  status: { position: 'absolute', left: space.xl, right: space.xl, bottom: space.xxxl },
  errorBox: { gap: space.md },
  loading: { alignItems: 'center', gap: space.sm },
});
