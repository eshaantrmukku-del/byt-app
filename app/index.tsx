import { router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { env } from '@/config/env';
import { useGate } from '@/features/session/useGate';
import { logOut } from '@/services/authService';
import { retryProfile } from '@/services/session';
import { useProfileStore } from '@/stores/profileStore';
import { SPLASH_BACKGROUND, theme } from '@/ui';

const USE_NATIVE = Platform.OS !== 'web';
const MIN_SPLASH_MS = 2400;
const LOGO = require('../assets/images/icon.png');

const WORDS = [
  { cap: 'B', rest: 'uild' },
  { cap: 'Y', rest: 'our' },
  { cap: 'T', rest: 'omorrow' },
] as const;

// The intro plays once per app launch; later visits (e.g. after logout) route straight through.
let introPlayed = false;

export default function Splash() {
  const gate = useGate();
  const profileError = useProfileStore((s) => s.error);
  const [minTimeDone, setMinTimeDone] = useState(introPlayed);
  const [anim] = useState(() => ({
    logo: new Animated.Value(introPlayed ? 0 : 1),
    intro: new Animated.Value(introPlayed ? 1 : 0),
    reveal: WORDS.map(() => new Animated.Value(introPlayed ? 1 : 0)),
    bar: new Animated.Value(introPlayed ? 1 : 0),
  }));

  useEffect(() => {
    const hide = setTimeout(() => SplashScreen.hideAsync().catch(() => undefined), 50);
    if (introPlayed) return () => clearTimeout(hide);
    const timing = (value: Animated.Value, toValue: number, duration: number, easing = Easing.out(Easing.cubic)) =>
      Animated.timing(value, { toValue, duration, easing, useNativeDriver: USE_NATIVE });
    const sequence = Animated.sequence([
      Animated.delay(700),
      timing(anim.logo, 0, 380, Easing.inOut(Easing.cubic)),
      timing(anim.intro, 1, 480),
      Animated.delay(220),
      Animated.stagger(
        150,
        anim.reveal.map((v) => timing(v, 1, 520))
      ),
      timing(anim.bar, 1, 520),
    ]);
    sequence.start();
    const minimum = setTimeout(() => {
      introPlayed = true;
      setMinTimeDone(true);
    }, MIN_SPLASH_MS);
    return () => {
      clearTimeout(hide);
      clearTimeout(minimum);
      sequence.stop();
    };
  }, [anim]);

  useEffect(() => {
    if (!minTimeDone) return;
    if (gate === 'signedOut') router.replace('/auth/login');
    else if (gate === 'onboarding') router.replace('/onboarding');
    else if (gate === 'ready') router.replace('/(tabs)');
  }, [minTimeDone, gate]);

  const waiting = gate === 'booting' || gate === 'loadingProfile';

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.logoWrap,
          {
            opacity: anim.logo,
            transform: [{ scale: anim.logo.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
          },
        ]}
        pointerEvents="none"
      >
        <Image source={LOGO} style={styles.logo} resizeMode="contain" />
      </Animated.View>

      <Animated.View
        style={[
          styles.group,
          {
            opacity: anim.intro,
            transform: [
              { scale: anim.intro.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
              { translateY: anim.intro.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
            ],
          },
        ]}
      >
        {WORDS.map((word, i) => {
          const reveal = anim.reveal[i]!;
          return (
            <View key={word.cap} style={styles.wordRow}>
              <Text style={styles.word}>{word.cap}</Text>
              <Animated.Text
                style={[
                  styles.word,
                  {
                    opacity: reveal,
                    transform: [{ translateX: reveal.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) }],
                  },
                ]}
              >
                {word.rest}
              </Animated.Text>
            </View>
          );
        })}
        <Animated.View style={[styles.accentBar, { transform: [{ scaleX: anim.bar }] }]} />
      </Animated.View>

      {!env.ok ? (
        <View style={styles.messageBox}>
          <Text style={styles.messageText}>BYT isn’t configured on this build. Check the Firebase settings and restart.</Text>
        </View>
      ) : gate === 'profileUnavailable' && minTimeDone ? (
        <View style={styles.messageBox}>
          <Text style={styles.messageText}>{profileError ?? 'We couldn’t load your account.'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={retryProfile} activeOpacity={0.85}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => void logOut({ force: true })} style={styles.secondaryAction}>
            <Text style={styles.secondaryText}>Log out</Text>
          </TouchableOpacity>
        </View>
      ) : waiting && minTimeDone ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={theme.textSecondary} size="small" />
          <Text style={styles.loadingText}>Connecting…</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SPLASH_BACKGROUND, alignItems: 'center', justifyContent: 'center' },
  logoWrap: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  logo: { width: 168, height: 168, borderRadius: 36 },
  group: { alignItems: 'flex-start' },
  wordRow: { flexDirection: 'row', alignItems: 'flex-end' },
  word: { color: theme.text, fontSize: 52, lineHeight: 58, fontWeight: '900', letterSpacing: -1 },
  accentBar: {
    width: 72,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.primary,
    marginTop: 18,
    alignSelf: 'flex-start',
  },
  loadingRow: { position: 'absolute', bottom: 64, flexDirection: 'row', alignItems: 'center', gap: 10 },
  loadingText: { color: theme.textSecondary, fontSize: 15, fontWeight: '500' },
  messageBox: { position: 'absolute', bottom: 48, left: 24, right: 24, alignItems: 'center', gap: 12 },
  messageText: { color: theme.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  retryButton: {
    alignSelf: 'stretch',
    backgroundColor: theme.primary,
    borderRadius: 16,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  secondaryAction: { paddingVertical: 8 },
  secondaryText: { color: theme.textSecondary, fontSize: 15, fontWeight: '600' },
});
