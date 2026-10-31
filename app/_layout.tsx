import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';

import { useGate } from '@/features/session/useGate';
import { consumePendingNotification, startNotifications } from '@/services/notifications';
import { startSession } from '@/services/session';
import { colors, navigationTheme } from '@/ui';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  useEffect(() => startSession(), []);
  const gate = useGate();
  const ready = useRef(false);
  // A tapped reminder opens its screen as soon as the signed-in app is showing.
  useEffect(() => startNotifications(() => ready.current && consumePendingNotification()), []);
  useEffect(() => {
    ready.current = gate === 'ready';
    if (ready.current) consumePendingNotification();
  }, [gate]);

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Protected guard={gate === 'signedOut'}>
          <Stack.Screen name="auth" />
        </Stack.Protected>
        <Stack.Protected guard={gate === 'onboarding'}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={gate === 'ready'}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="edit-profile" options={{ animation: 'default' }} />
          <Stack.Screen name="check-in" options={{ animation: 'default' }} />
          <Stack.Screen name="journal" options={{ animation: 'default' }} />
          <Stack.Screen name="ai-coach" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="chats" options={{ animation: 'default' }} />
          <Stack.Screen name="voice-call" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        </Stack.Protected>
        <Stack.Screen name="privacy" options={{ animation: 'default' }} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </ThemeProvider>
  );
}
