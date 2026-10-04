import { StyleSheet, Text, View } from 'react-native';

import { colors } from './theme';

/** Bold white BYT with the blue line running through it, as in the app icon. */
export function Logo({ size = 48 }: { size?: number }) {
  const lineHeight = Math.round(size * 1.1);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="BYT" style={styles.wrap}>
      <View
        style={[
          styles.line,
          {
            height: Math.max(2, Math.round(size * 0.05)),
            top: Math.round(lineHeight * 0.44),
            left: -Math.round(size * 0.18),
            right: -Math.round(size * 0.12),
          },
        ]}
      />
      <Text style={[styles.text, { fontSize: size, lineHeight, letterSpacing: size * 0.02 }]}>BYT</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center', justifyContent: 'center' },
  line: { position: 'absolute', backgroundColor: colors.accent },
  text: { color: colors.text, fontWeight: '800', includeFontPadding: false },
});
