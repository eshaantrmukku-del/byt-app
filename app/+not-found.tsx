import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { theme } from '@/ui';

export default function NotFound() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Oops! This screen doesn’t exist.</Text>
      <TouchableOpacity onPress={() => router.replace('/')} style={styles.link} accessibilityRole="link">
        <Text style={styles.linkText}>Go to home screen</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 20, fontWeight: '700', color: theme.text, textAlign: 'center' },
  link: { marginTop: 16, paddingVertical: 12 },
  linkText: { fontSize: 15, color: theme.primary, fontWeight: '600' },
});
