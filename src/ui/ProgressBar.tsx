import { StyleSheet, View } from 'react-native';

import { colors, radius } from './theme';

export function ProgressBar({ value, muted }: { value: number; muted?: boolean }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
    >
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: muted ? colors.textMuted : colors.accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
});
