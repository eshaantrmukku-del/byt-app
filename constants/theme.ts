/**
 * BYT (Build Your Tomorrow) design system — dark theme only.
 *
 * A single source of truth for color, spacing, radius, typography and shadow.
 * All historical keys are preserved so existing screens keep working, while a
 * few new semantic tokens (accent, success, tints, etc.) enable a cleaner look.
 */

import { DarkTheme, type Theme } from '@react-navigation/native';
import { Platform } from 'react-native';

export const PRIMARY_BLUE = '#3B82F6';
const PRIMARY_BLUE_ALT = '#2563EB';

export type ThemeColors = {
  text: string;
  textSecondary: string;
  textMuted: string;
  background: string;
  tint: string;
  icon: string;
  tabIconDefault: string;
  tabIconSelected: string;
  primary: string;
  primaryAlt: string;
  primarySoft: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
  card: string;
  border: string;
  surface: string;
  surfaceElevated: string;
  headerBorder: string;
  shadow: string;
};

export const theme: ThemeColors = {
  text: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  background: '#0B1120',
  tint: '#FFFFFF',
  icon: '#94A3B8',
  tabIconDefault: '#64748B',
  tabIconSelected: '#FFFFFF',
  primary: PRIMARY_BLUE,
  primaryAlt: PRIMARY_BLUE_ALT,
  primarySoft: 'rgba(59, 130, 246, 0.14)',
  accent: '#22D3EE',
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
  card: '#141C2B',
  border: '#27324A',
  surface: '#1B2436',
  surfaceElevated: '#222C42',
  headerBorder: 'rgba(255, 255, 255, 0.06)',
  shadow: '#000000',
};

/** @deprecated Use `theme` — kept so existing `Colors[colorScheme]` calls still work */
export const Colors = {
  dark: theme,
  light: theme,
};

/** Consistent spacing scale (multiples of 4). */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Corner radii. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  pill: 999,
} as const;

/** Reusable elevation presets tuned for the dark surface. */
export const shadows = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 3,
  },
  floating: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 22,
    elevation: 8,
  },
  glow: {
    shadowColor: PRIMARY_BLUE,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 8,
  },
} as const;

export function createNavigationTheme(): Theme {
  return {
    ...DarkTheme,
    dark: true,
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
}

/** Auth / onboarding screens */
export function getAuthTheme() {
  return {
    gradient: ['#0B1120', '#16275C'] as [string, string],
    container: theme.background,
    title: '#FFFFFF',
    subtitle: theme.textSecondary,
    inputBg: theme.card,
    inputBorder: theme.border,
    inputText: '#FFFFFF',
    iconMuted: theme.textSecondary,
    iconBoxBg: 'rgba(59, 130, 246, 0.16)',
    iconBoxBorder: 'rgba(96, 165, 250, 0.28)',
    link: theme.textSecondary,
    linkHighlight: '#60A5FA',
    button: theme.primary,
    buttonShadow: theme.primary,
  };
}

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
