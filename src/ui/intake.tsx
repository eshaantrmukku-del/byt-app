import { Platform, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import type { DobParts } from '@/features/profile/dob';

import { theme } from './theme';

/** Labelled input in the intake style (onboarding + personal info). */
export function IntakeField({ label, multiline, ...rest }: TextInputProps & { label: string }) {
  return (
    <>
      <Text style={intakeStyles.label}>{label}</Text>
      <TextInput
        style={[intakeStyles.input, multiline && intakeStyles.multiline]}
        placeholderTextColor={theme.textMuted}
        selectionColor={theme.primary}
        accessibilityLabel={label}
        multiline={multiline}
        {...rest}
      />
    </>
  );
}

export function DobInputs({ value, onChange }: { value: DobParts; onChange: (value: DobParts) => void }) {
  const set = (key: keyof DobParts, max: number) => (text: string) =>
    onChange({ ...value, [key]: text.replace(/\D/g, '').slice(0, max) });
  return (
    <>
      <Text style={intakeStyles.label}>Date of birth *</Text>
      <Text style={intakeStyles.hint}>Day / month / year</Text>
      <View style={intakeStyles.dobRow}>
        <TextInput
          style={[intakeStyles.input, intakeStyles.dobInput]}
          placeholder="DD"
          placeholderTextColor={theme.textMuted}
          accessibilityLabel="Day of birth"
          value={value.day}
          onChangeText={set('day', 2)}
          keyboardType="number-pad"
          maxLength={2}
        />
        <Text style={intakeStyles.dobSep}>/</Text>
        <TextInput
          style={[intakeStyles.input, intakeStyles.dobInput]}
          placeholder="MM"
          placeholderTextColor={theme.textMuted}
          accessibilityLabel="Month of birth"
          value={value.month}
          onChangeText={set('month', 2)}
          keyboardType="number-pad"
          maxLength={2}
        />
        <Text style={intakeStyles.dobSep}>/</Text>
        <TextInput
          style={[intakeStyles.input, intakeStyles.dobYear]}
          placeholder="YYYY"
          placeholderTextColor={theme.textMuted}
          accessibilityLabel="Year of birth"
          value={value.year}
          onChangeText={set('year', 4)}
          keyboardType="number-pad"
          maxLength={4}
        />
      </View>
    </>
  );
}

export const intakeStyles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: theme.text, marginBottom: 8, marginTop: 4 },
  hint: { fontSize: 12, color: theme.textSecondary, marginBottom: 8, marginTop: -4 },
  dobRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  dobInput: { flex: 1, minWidth: 0, textAlign: 'center', marginBottom: 0 },
  dobYear: { flex: 1.4, minWidth: 0, textAlign: 'center', marginBottom: 0 },
  dobSep: { color: theme.textSecondary, fontSize: 18, fontWeight: '600', marginHorizontal: 6 },
  optionalHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.textSecondary,
    letterSpacing: 1.2,
    marginTop: 12,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    color: theme.text,
    fontSize: 16,
    marginBottom: 14,
  },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
});
