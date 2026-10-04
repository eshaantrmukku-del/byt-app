import { BarChart2 } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/ui';

/** Placeholder until Insights (Reflect / Discuss with the coach) is built. */
export default function InsightsScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <Text style={styles.headerTitle}>Your Progress</Text>
      <View style={styles.card}>
        <View style={styles.iconBox}>
          <BarChart2 size={24} color={theme.primary} />
        </View>
        <Text style={styles.title}>Insights are on the way</Text>
        <Text style={styles.body}>
          Weekly activity, reflections from your check-ins and coach insights arrive in an upcoming build.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.background, paddingHorizontal: 24 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: theme.text, textAlign: 'center', marginTop: 16, marginBottom: 24 },
  card: {
    backgroundColor: theme.card,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: theme.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '700', color: theme.text },
  body: { fontSize: 15, color: theme.textSecondary, textAlign: 'center', lineHeight: 22 },
});
