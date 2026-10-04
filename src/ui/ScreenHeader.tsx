import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { colors, space } from './theme';

type Props = { title: string; onBack?: () => void; right?: ReactNode };

export function ScreenHeader({ title, onBack, right }: Props) {
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack ?? (() => router.back())}
        hitSlop={12}
        style={styles.side}
      >
        <Ionicons name="chevron-back" size={26} color={colors.text} />
      </Pressable>
      <AppText variant="heading" numberOfLines={1} style={styles.title}>
        {title}
      </AppText>
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: space.sm },
  side: { minWidth: 44, justifyContent: 'center' },
  right: { alignItems: 'flex-end' },
  title: { flex: 1, textAlign: 'center' },
});
