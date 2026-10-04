import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { useGate } from '@/features/session/useGate';
import { startSession } from '@/services/session';
import { colors, navigationTheme } from '@/ui';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  useEffect(() => startSession(), []);
  const gate = useGate();

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
          <Stack.Screen name="edit-profile" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="goal/[id]" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="check-in" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="journal" options={{ animation: 'slide_from_right' }} />
        </Stack.Protected>
        <Stack.Screen name="privacy" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </ThemeProvider>
  );
}
