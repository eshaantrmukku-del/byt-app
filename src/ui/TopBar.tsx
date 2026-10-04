import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from './theme';

/** Bordered top bar: back chevron, centred title, optional right action. */
export function TopBar({ title, right, onBack }: { title: string; right?: ReactNode; onBack?: () => void }) {
  return (
    <View style={styles.topBar}>
      <Pressable
        onPress={onBack ?? (() => router.back())}
        style={styles.back}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <ChevronLeft size={24} color={theme.text} />
      </Pressable>
      <Text style={styles.topTitle}>{title}</Text>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topTitle: { color: theme.text, fontSize: 16, fontWeight: '700' },
  right: { minWidth: 40, alignItems: 'flex-end' },
});
