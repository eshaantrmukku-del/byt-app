import { DarkTheme, type Theme } from 'expo-router';
import type { TextStyle } from 'react-native';

/** BYT design tokens — the prototype's dark navy palette. */
export const theme = {
  text: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  background: '#0B1120',
  icon: '#94A3B8',
  tabIconDefault: '#64748B',
  primary: '#3B82F6',
  primaryAlt: '#2563EB',
  primarySoft: 'rgba(59, 130, 246, 0.14)',
  accent: '#22D3EE',
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
  card: '#141C2B',
  border: '#27324A',
  surface: '#1B2436',
  surfaceElevated: '#222C42',
} as const;

/** Native splash / launch background (matches the app icon). */
export const SPLASH_BACKGROUND = '#141414';

/** Auth, onboarding and intake screens. */
export const authTheme = {
  gradient: ['#0B1120', '#16275C'] as const,
  title: '#FFFFFF',
  subtitle: theme.textSecondary,
  inputBg: theme.card,
  inputBorder: theme.border,
  iconMuted: theme.textSecondary,
  iconBoxBg: 'rgba(59, 130, 246, 0.16)',
  iconBoxBorder: 'rgba(96, 165, 250, 0.28)',
  link: theme.textSecondary,
  linkHighlight: '#60A5FA',
  button: theme.primary,
} as const;

export const shadows = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 3,
  },
  glow: {
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 8,
  },
  button: {
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
} as const;

/** Names used by the shared components in src/ui. */
export const colors = {
  bg: theme.background,
  surface: theme.card,
  surfaceRaised: theme.surfaceElevated,
  border: theme.border,
  borderStrong: theme.surfaceElevated,
  text: theme.text,
  textSecondary: theme.textSecondary,
  textMuted: theme.textMuted,
  accent: theme.primary,
  accentPressed: theme.primaryAlt,
  accentSoft: theme.primarySoft,
  onAccent: '#FFFFFF',
  danger: '#F87171',
  dangerSoft: 'rgba(239, 68, 68, 0.12)',
  success: theme.success,
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { sm: 8, md: 14, lg: 20, pill: 999 } as const;

export const type = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -0.5 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  overline: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
} as const satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

export const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: theme.primary,
    background: theme.background,
    card: theme.card,
    text: theme.text,
    border: theme.border,
    notification: theme.primary,
  },
};
