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
          <Stack.Screen name="edit-profile" options={{ animation: 'default' }} />
          <Stack.Screen name="check-in" options={{ animation: 'default' }} />
          <Stack.Screen name="journal" options={{ animation: 'default' }} />
          <Stack.Screen name="ai-coach" options={{ animation: 'default' }} />
          <Stack.Screen name="chats" options={{ animation: 'default' }} />
          <Stack.Screen name="voice-call" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        </Stack.Protected>
        <Stack.Screen name="privacy" options={{ animation: 'default' }} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </ThemeProvider>
  );
}
