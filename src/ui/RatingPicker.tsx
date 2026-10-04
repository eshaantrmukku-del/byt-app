import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { colors, radius, space } from './theme';

type Props = {
  label: string;
  question: string;
  low: string;
  high: string;
  value: number | null;
  onChange: (value: number) => void;
};

/** 1–5 rating as five equal segments with end labels. */
export function RatingPicker({ label, question, low, high, value, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      <AppText variant="bodyStrong">{question}</AppText>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {[1, 2, 3, 4, 5].map((n) => {
          const selected = value === n;
          return (
            <Pressable
              key={n}
              accessibilityRole="radio"
              accessibilityLabel={`${label} ${n} of 5`}
              accessibilityState={{ selected }}
              onPress={() => onChange(n)}
              style={({ pressed }) => [styles.cell, selected && styles.selected, pressed && styles.pressed]}
            >
              <AppText variant="bodyStrong" style={{ color: selected ? colors.onAccent : colors.textSecondary }}>
                {n}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.ends}>
        <AppText variant="caption" tone="muted">
          {low}
        </AppText>
        <AppText variant="caption" tone="muted">
          {high}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm },
  cell: {
    flex: 1,
    minWidth: 0,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selected: { backgroundColor: colors.accent, borderColor: colors.accent },
  pressed: { opacity: 0.75 },
  ends: { flexDirection: 'row', justifyContent: 'space-between' },
});
