import { theme } from '@/constants/theme';
import { useStore } from '@/store/useStore';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Image, Platform, StyleSheet, Text, View } from 'react-native';

const USE_NATIVE = Platform.OS !== 'web';
const MIN_SPLASH_MS = 2400;
const LOGO = require('../assets/images/icon.png');

const WORDS = [
    { cap: 'B', rest: 'uild' },
    { cap: 'Y', rest: 'our' },
    { cap: 'T', rest: 'omorrow' },
];

export default function Index() {
    const router = useRouter();
    const { user, isHydrated, firebaseAuthReady, onboardingCompleted } = useStore();
    const [hasNavigated, setHasNavigated] = useState(false);

    const mountTime = useRef(Date.now());
    const logo = useRef(new Animated.Value(1)).current;
    const intro = useRef(new Animated.Value(0)).current;
    const reveal = useRef(WORDS.map(() => new Animated.Value(0))).current;
    const bar = useRef(new Animated.Value(0)).current;

    const styles = useMemo(() => getStyles(), []);

    const navigate = () => {
        if (hasNavigated) return;
        setHasNavigated(true);
        if (user) {
            router.replace(onboardingCompleted ? '/(tabs)' : '/onboarding');
        } else {
            router.replace('/auth/login');
        }
    };

    useEffect(() => {
        Animated.sequence([
            Animated.delay(700),
            Animated.timing(logo, {
                toValue: 0,
                duration: 380,
                easing: Easing.inOut(Easing.cubic),
                useNativeDriver: USE_NATIVE,
            }),
            Animated.timing(intro, {
                toValue: 1,
                duration: 480,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: USE_NATIVE,
            }),
            Animated.delay(220),
            Animated.stagger(
                150,
                reveal.map((value) =>
                    Animated.timing(value, {
                        toValue: 1,
                        duration: 520,
                        easing: Easing.out(Easing.cubic),
                        useNativeDriver: USE_NATIVE,
                    })
                )
            ),
            Animated.timing(bar, {
                toValue: 1,
                duration: 520,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: USE_NATIVE,
            }),
        ]).start();

        const fallback = setTimeout(() => navigate(), 11000);
        return () => clearTimeout(fallback);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!(isHydrated && firebaseAuthReady)) return;
        const elapsed = Date.now() - mountTime.current;
        const remaining = Math.max(0, MIN_SPLASH_MS - elapsed);
        const timer = setTimeout(() => navigate(), remaining);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isHydrated, firebaseAuthReady, user, onboardingCompleted]);

    const waitingForAuth = isHydrated && !firebaseAuthReady;

    const logoStyle = {
        opacity: logo,
        transform: [
            { scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
        ],
    };

    const groupStyle = {
        opacity: intro,
        transform: [
            { scale: intro.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
            { translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
        ],
    };

    return (
        <View style={styles.container}>
            <Animated.View style={[styles.logoWrap, logoStyle]} pointerEvents="none">
                <Image source={LOGO} style={styles.logo} resizeMode="contain" />
            </Animated.View>

            <Animated.View style={[styles.group, groupStyle]}>
                {WORDS.map((word, i) => (
                    <View key={word.cap} style={styles.wordRow}>
                        <Text style={styles.cap}>{word.cap}</Text>
                        <Animated.Text
                            style={[
                                styles.rest,
                                {
                                    opacity: reveal[i],
                                    transform: [
                                        {
                                            translateX: reveal[i].interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [-14, 0],
                                            }),
                                        },
                                    ],
                                },
                            ]}
                        >
                            {word.rest}
                        </Animated.Text>
                    </View>
                ))}

                <Animated.View style={[styles.accentBar, { transform: [{ scaleX: bar }] }]} />
            </Animated.View>

            {waitingForAuth ? (
                <View style={styles.loadingRow}>
                    <ActivityIndicator color={theme.textSecondary} size="small" />
                    <Text style={styles.loadingText}>Connecting…</Text>
                </View>
            ) : null}
        </View>
    );
}

function getStyles() {
    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: '#141414',
            alignItems: 'center',
            justifyContent: 'center',
        },
        logoWrap: {
            position: 'absolute',
            alignItems: 'center',
            justifyContent: 'center',
        },
        logo: {
            width: 168,
            height: 168,
            borderRadius: 36,
        },
        group: {
            alignItems: 'flex-start',
            opacity: 0,
        },
        wordRow: {
            flexDirection: 'row',
            alignItems: 'flex-end',
        },
        cap: {
            color: theme.text,
            fontSize: 52,
            lineHeight: 58,
            fontWeight: '900',
            letterSpacing: -1,
        },
        rest: {
            color: theme.text,
            fontSize: 52,
            lineHeight: 58,
            fontWeight: '900',
            letterSpacing: -1,
        },
        accentBar: {
            width: 72,
            height: 4,
            borderRadius: 2,
            backgroundColor: theme.primary,
            marginTop: 18,
            alignSelf: 'flex-start',
        },
        loadingRow: {
            position: 'absolute',
            bottom: 64,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
        },
        loadingText: {
            color: theme.textSecondary,
            fontSize: 15,
            fontWeight: '500',
        },
    });
}
