import { useRef, type RefObject } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import type { DobParts } from '@/features/profile/dob';

import { AppText } from './AppText';
import { colors, radius, space, type } from './theme';

type Props = {
  value: DobParts;
  onChange: (value: DobParts) => void;
  error?: string | null;
};

export function DobField({ value, onChange, error }: Props) {
  const monthRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);

  const handle = (key: keyof DobParts, max: number, text: string, next?: RefObject<TextInput | null>) => {
    const digits = text.replace(/\D/g, '').slice(0, max);
    onChange({ ...value, [key]: digits });
    if (digits.length === max) next?.current?.focus();
  };

  return (
    <View style={styles.wrap}>
      <AppText variant="label" tone="secondary">
        Date of birth
      </AppText>
      <View style={styles.row}>
        <TextInput
          accessibilityLabel="Day of birth"
          value={value.day}
          onChangeText={(t) => handle('day', 2, t, monthRef)}
          placeholder="DD"
          keyboardType="number-pad"
          maxLength={2}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          style={[styles.input, styles.short, !!error && styles.invalid]}
        />
        <TextInput
          ref={monthRef}
          accessibilityLabel="Month of birth"
          value={value.month}
          onChangeText={(t) => handle('month', 2, t, yearRef)}
          placeholder="MM"
          keyboardType="number-pad"
          maxLength={2}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          style={[styles.input, styles.short, !!error && styles.invalid]}
        />
        <TextInput
          ref={yearRef}
          accessibilityLabel="Year of birth"
          value={value.year}
          onChangeText={(t) => handle('year', 4, t)}
          placeholder="YYYY"
          keyboardType="number-pad"
          maxLength={4}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          style={[styles.input, styles.long, !!error && styles.invalid]}
        />
      </View>
      {error ? (
        <AppText variant="caption" tone="danger">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm },
  input: {
    ...type.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    minHeight: 52,
    textAlign: 'center',
  },
  short: { flex: 1, minWidth: 0 },
  long: { flex: 1.6, minWidth: 0 },
  invalid: { borderColor: colors.danger },
});
