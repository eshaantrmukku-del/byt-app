import { router, Tabs } from 'expo-router';
import { BarChart2, Home, MessageCircle, Settings, Target } from 'lucide-react-native';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { PressScale, shadows, theme } from '@/ui';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.tabIconDefault,
        headerShown: false,
        // A soft cross-fade between tabs instead of a hard cut.
        animation: 'fade',
        sceneStyle: { backgroundColor: theme.background },
        tabBarStyle: {
          backgroundColor: theme.card,
          borderTopColor: theme.border,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 88 : 68,
          paddingBottom: Platform.OS === 'ios' ? 28 : 12,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <Home size={24} color={color} /> }} />
      <Tabs.Screen name="goals" options={{ title: 'Goals', tabBarIcon: ({ color }) => <Target size={24} color={color} /> }} />
      {/* The coach opens full screen over the tabs, so this tab is a button, not a page. */}
      <Tabs.Screen
        name="coach"
        options={{
          title: 'Coach',
          tabBarButton: ({ onPress }) => (
            <PressScale scaleTo={0.9} onPress={onPress} containerStyle={styles.coachTab} style={styles.coachInner} accessibilityRole="button" accessibilityLabel="Talk to your coach">
              <View style={styles.coachCircle}>
                <MessageCircle size={26} color="#FFFFFF" />
              </View>
              <Text style={styles.coachLabel}>Coach</Text>
            </PressScale>
          ),
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.push('/ai-coach');
          },
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{ title: 'Insights', tabBarIcon: ({ color }) => <BarChart2 size={24} color={color} /> }}
      />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({ color }) => <Settings size={24} color={color} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  coachTab: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  coachInner: { alignItems: 'center' },
  coachCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginTop: -22,
    backgroundColor: theme.primary,
    borderWidth: 4,
    borderColor: theme.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.glow,
  },
  coachLabel: { marginTop: 2, fontSize: 11, fontWeight: '600', color: theme.text },
});
