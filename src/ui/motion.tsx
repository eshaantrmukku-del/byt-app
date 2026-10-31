import { useEffect, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

/** Shared motion: short, eased and never in the way. */
const USE_NATIVE = Platform.OS !== 'web';
const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);

/** Follows the system "reduce motion" setting, so animations can be skipped. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => active && setReduced(value))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      active = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

type FadeInProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Wait before starting, for staggered lists. */
  delay?: number;
  /** How far it rises into place, in points. */
  from?: number;
  /** False shows it at once (e.g. messages that were already there). */
  animate?: boolean;
};

/** Fades and rises into place once, when it first appears. */
export function FadeIn({ children, style, delay = 0, from = 10, animate = true }: FadeInProps) {
  const reduced = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(animate ? 0 : 1));
  useEffect(() => {
    if (!animate) return;
    Animated.timing(progress, { toValue: 1, duration: 420, delay, easing: EASE_OUT, useNativeDriver: USE_NATIVE }).start();
  }, [animate, delay, progress]);
  const translateY = reduced ? 0 : progress.interpolate({ inputRange: [0, 1], outputRange: [from, 0] });
  return <Animated.View style={[style, { opacity: progress, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

/** Stagger for the nth item of a list on screen: quick, and capped so long lists don't drag. */
export const stagger = (index: number, step = 55) => Math.min(index, 8) * step;

type PressScaleProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** Layout of the touch area itself (e.g. flex: 1 in a row); `style` is what scales. */
  containerStyle?: StyleProp<ViewStyle>;
  /** How far it shrinks while held. */
  scaleTo?: number;
  children: ReactNode;
};

/** A Pressable that gives a soft, springy press. */
export function PressScale({ style, containerStyle, scaleTo = 0.97, children, onPressIn, onPressOut, ...rest }: PressScaleProps) {
  const [scale] = useState(() => new Animated.Value(1));
  const spring = (toValue: number) =>
    Animated.spring(scale, { toValue, useNativeDriver: USE_NATIVE, speed: 40, bounciness: toValue === 1 ? 6 : 0 }).start();
  return (
    <Pressable
      {...rest}
      style={containerStyle}
      onPressIn={(e) => {
        spring(scaleTo);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        spring(1);
        onPressOut?.(e);
      }}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Three dots that rise in turn: the coach is writing. */
export function TypingDots({ color, size = 7 }: { color: string; size?: number }) {
  const [dots] = useState(() => [0, 1, 2].map(() => new Animated.Value(0)));
  useEffect(() => {
    const loops = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(dot, { toValue: 1, duration: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE }),
          Animated.timing(dot, { toValue: 0, duration: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE }),
          Animated.delay((2 - i) * 150 + 200),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [dots]);
  return (
    <Animated.View style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.7, height: size * 3 }}>
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
            transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.6] }) }],
          }}
        />
      ))}
    </Animated.View>
  );
}

/** A progress bar that fills smoothly to `percent`, and again whenever it changes. */
export function AnimatedBar({
  percent,
  color,
  track,
  height = 8,
  delay = 0,
}: {
  percent: number;
  color: string;
  track: string;
  height?: number;
  delay?: number;
}) {
  const [fill] = useState(() => new Animated.Value(0));
  useEffect(() => {
    // Width can't run on the native driver; this is a single short tween per change.
    Animated.timing(fill, { toValue: Math.max(0, Math.min(100, percent)), duration: 700, delay, easing: EASE_OUT, useNativeDriver: false }).start();
  }, [percent, delay, fill]);
  const width = fill.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });
  return (
    <Animated.View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }}>
      <Animated.View style={{ width, height: '100%', borderRadius: height / 2, backgroundColor: color }} />
    </Animated.View>
  );
}
