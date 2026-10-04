import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { colors, radius, space } from './theme';

type Props = { tone?: 'error' | 'info'; message: string };

export function Banner({ tone = 'error', message }: Props) {
  const isError = tone === 'error';
  return (
    <View
      accessibilityRole="alert"
      style={[styles.wrap, { backgroundColor: isError ? colors.dangerSoft : colors.accentSoft }]}
    >
      <Ionicons
        name={isError ? 'alert-circle-outline' : 'information-circle-outline'}
        size={18}
        color={isError ? colors.danger : colors.accent}
        style={styles.icon}
      />
      <AppText variant="caption" style={styles.text}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: space.sm,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  icon: { marginTop: 0 },
  text: { flex: 1, color: colors.text },
});
