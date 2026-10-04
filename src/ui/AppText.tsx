import { StyleSheet, Text, type TextProps } from 'react-native';

import { colors, type, type TypeVariant } from './theme';

type Tone = 'primary' | 'secondary' | 'muted' | 'accent' | 'danger';

const TONES: Record<Tone, string> = {
  primary: colors.text,
  secondary: colors.textSecondary,
  muted: colors.textMuted,
  accent: colors.accent,
  danger: colors.danger,
};

export type AppTextProps = TextProps & { variant?: TypeVariant; tone?: Tone; center?: boolean };

export function AppText({ variant = 'body', tone = 'primary', center, style, ...rest }: AppTextProps) {
  return (
    <Text
      {...rest}
      style={[type[variant], { color: TONES[tone] }, center && styles.center, style]}
    />
  );
}

const styles = StyleSheet.create({ center: { textAlign: 'center' } });
