import { Pressable, StyleSheet } from 'react-native';

import { AppText } from './AppText';
import { colors, radius, space } from './theme';

type Props = { label: string; selected: boolean; onPress: () => void; accessibilityLabel?: string };

export function Chip({ label, selected, onPress, accessibilityLabel }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.selected, pressed && styles.pressed]}
    >
      <AppText variant="label" style={{ color: selected ? colors.text : colors.textSecondary }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  pressed: { opacity: 0.75 },
});
