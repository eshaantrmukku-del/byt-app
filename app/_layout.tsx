import { ChatsProvider } from '@/context/ChatsContext';
import { FirebaseUserSync } from '@/context/FirebaseUserSync';
import { GoalsProvider } from '@/context/GoalsContext';
import { createNavigationTheme, theme } from '@/constants/theme';
import { ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { SafeAreaProvider } from 'react-native-safe-area-context';

SplashScreen.preventAutoHideAsync().catch(() => {});

const navigationTheme = createNavigationTheme();

export default function RootLayout() {
  useEffect(() => {
    // Hide native splash once the root layout is mounted; index screen owns the branded intro.
    const timer = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.background }}>
        <GoalsProvider>
          <ChatsProvider>
            <FirebaseUserSync>
              <ThemeProvider value={navigationTheme}>
                <Stack
                  screenOptions={{
                    contentStyle: { backgroundColor: theme.background },
                    headerStyle: { backgroundColor: theme.card },
                    headerTintColor: theme.text,
                    headerTitleStyle: { color: theme.text },
                  }}
                >
                  <Stack.Screen name="index" options={{ headerShown: false }} />
                  <Stack.Screen name="auth/login" options={{ headerShown: false }} />
                  <Stack.Screen name="auth/signup" options={{ headerShown: false }} />
                  <Stack.Screen name="onboarding" options={{ headerShown: false }} />
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="check-in" options={{ presentation: 'card', title: 'Daily Check-In', headerBackTitle: 'Back' }} />
                  <Stack.Screen name="ai-coach" options={{ presentation: 'card', title: 'AI Coach', headerBackTitle: 'Back' }} />
                  <Stack.Screen name="journal" options={{ presentation: 'card', title: 'Journal', headerBackTitle: 'Back' }} />
                  <Stack.Screen name="chats" options={{ presentation: 'card', title: 'Chat History', headerBackTitle: 'Back' }} />
                  <Stack.Screen name="voice-call" options={{ presentation: 'fullScreenModal', headerShown: false }} />
                  <Stack.Screen name="privacy" options={{ headerShown: false }} />
                  <Stack.Screen name="edit-profile" options={{ headerShown: false }} />
                  <Stack.Screen name="+not-found" options={{ title: 'Oops!' }} />
                </Stack>
                <StatusBar style="light" />
              </ThemeProvider>
            </FirebaseUserSync>
          </ChatsProvider>
        </GoalsProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
