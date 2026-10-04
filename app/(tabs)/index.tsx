import { SafeAreaView } from "react-native-safe-area-context";
import { shadows, theme } from '@/constants/theme';
import { auth } from '@/services/firebase';
import { flushUserFirestoreNow } from '@/services/userFirestoreCoordinator';
import { MONTHLY_CREDIT_ALLOWANCE, useStore } from '@/store/useStore';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { Bell, BookOpen, Brain, CheckCircle, ChevronRight, Flame, LogOut, Menu, MessageSquare, Sparkles, TrendingUp, X } from 'lucide-react-native';
import React, { useRef, useState } from 'react';
import { Alert, Animated, Dimensions, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, Easing } from "react-native";

const { width } = Dimensions.get('window');
const MENU_WIDTH = width * 0.82;
const isDark = true;

export default function HomeScreen() {
    const router = useRouter();
    const { user, goals, checkIns, logout, creditsRemaining } = useStore();

    const [menuVisible, setMenuVisible] = useState(false);
    const slideAnim = useRef(new Animated.Value(-MENU_WIDTH)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    const openMenu = () => {
        setMenuVisible(true);
        slideAnim.setValue(-MENU_WIDTH);
        fadeAnim.setValue(0);
        Animated.parallel([
            Animated.spring(slideAnim, {
                toValue: 0,
                useNativeDriver: Platform.OS !== 'web',
                tension: 56,
                friction: 11,
            }),
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 280,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: Platform.OS !== 'web',
            }),
        ]).start();
    };

    const closeMenu = () => {
        Animated.parallel([
            Animated.timing(slideAnim, {
                toValue: -MENU_WIDTH,
                duration: 240,
                easing: Easing.in(Easing.cubic),
                useNativeDriver: Platform.OS !== 'web',
            }),
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 240,
                easing: Easing.in(Easing.cubic),
                useNativeDriver: Platform.OS !== 'web',
            }),
        ]).start(() => setMenuVisible(false));
    };

    const performLogout = async () => {
        closeMenu();
        try {
            await flushUserFirestoreNow();
            if (auth) {
                await signOut(auth);
            }
        } catch (e: any) {
            Alert.alert('Log out failed', e?.message || 'Please try again.');
            return;
        }
        logout();
        router.replace('/auth/login');
    };

    const handleLogout = () => {
        Alert.alert(
            'Log out?',
            'You can sign in with a different account afterward.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Log out',
                    style: 'destructive',
                    onPress: () => {
                        void performLogout();
                    },
                },
            ]
        );
    };

    const planLabel = 'Beta';

    const greeting = (() => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 18) return 'Good afternoon';
        return 'Good evening';
    })();

    const styles = getStyles(theme, isDark);

    // Calc Stats
    const activeGoals = goals.filter(g => g.status === 'Active').length;
    const totalGoals = goals.length || 1;
    const avgProgress = Math.round(goals.reduce((acc, g) => acc + g.progress, 0) / totalGoals);
    const streak = checkIns.length;

    return (
        <SafeAreaView style={styles.safeArea}>
            {/* Slide-in Menu Modal */}
            <Modal
                transparent={true}
                visible={menuVisible}
                onRequestClose={closeMenu}
                animationType="none"
                statusBarTranslucent
            >
                <View style={styles.menuOverlayContainer}>
                    <TouchableOpacity activeOpacity={1} style={styles.menuBackdropTouch} onPress={closeMenu}>
                        <Animated.View style={[styles.menuBackdrop, { opacity: fadeAnim }]} />
                    </TouchableOpacity>

                    <Animated.View style={[styles.menuContainer, { transform: [{ translateX: slideAnim }] }]}>
                        <LinearGradient
                            colors={isDark ? ['#1e293b', '#0f172a'] : ['#ffffff', '#f8fafc']}
                            style={styles.menuGradient}
                        >
                            <SafeAreaView style={styles.menuSafeArea}>
                                <View style={styles.menuHeader}>
                                    <View>
                                        <Text style={styles.menuTitle}>BYT</Text>
                                        <Text style={styles.menuSubtitle}>Build Your Tomorrow</Text>
                                    </View>
                                    <TouchableOpacity onPress={closeMenu} style={styles.closeButton}>
                                        <X size={24} color={theme.text} />
                                    </TouchableOpacity>
                                </View>

                                <ScrollView style={styles.menuItems} showsVerticalScrollIndicator={false}>
                                    <Text style={styles.menuSectionHeader}>TOOLS</Text>

                                    <TouchableOpacity style={styles.menuItem} onPress={() => { closeMenu(); router.push('/check-in'); }}>
                                        <View style={[styles.menuIconBox, { backgroundColor: 'rgba(59,130,246,0.16)' }]}>
                                            <CheckCircle size={20} color="#60A5FA" />
                                        </View>
                                        <Text style={styles.menuItemText}>Daily Check-In</Text>
                                        <ChevronRight size={16} color={theme.icon} style={{ marginLeft: 'auto' }} />
                                    </TouchableOpacity>

                                    <TouchableOpacity style={styles.menuItem} onPress={() => { closeMenu(); router.push('/chats'); }}>
                                        <View style={[styles.menuIconBox, { backgroundColor: 'rgba(124,58,237,0.16)' }]}>
                                            <Brain size={20} color="#A78BFA" />
                                        </View>
                                        <Text style={styles.menuItemText}>Chat with AI</Text>
                                        <ChevronRight size={16} color={theme.icon} style={{ marginLeft: 'auto' }} />
                                    </TouchableOpacity>

                                    <TouchableOpacity style={styles.menuItem} onPress={() => { closeMenu(); router.push('/(tabs)/goals'); }}>
                                        <View style={[styles.menuIconBox, { backgroundColor: 'rgba(34,211,238,0.16)' }]}>
                                            <TrendingUp size={20} color="#22D3EE" />
                                        </View>
                                        <Text style={styles.menuItemText}>My Goals</Text>
                                        <ChevronRight size={16} color={theme.icon} style={{ marginLeft: 'auto' }} />
                                    </TouchableOpacity>

                                    <TouchableOpacity style={styles.menuItem} onPress={() => { closeMenu(); router.push('/check-in'); }}>
                                        <View style={[styles.menuIconBox, { backgroundColor: 'rgba(245,158,11,0.16)' }]}>
                                            <Sparkles size={20} color="#FBBF24" />
                                        </View>
                                        <Text style={styles.menuItemText}>Reflect Now</Text>
                                        <ChevronRight size={16} color={theme.icon} style={{ marginLeft: 'auto' }} />
                                    </TouchableOpacity>

                                    <View style={styles.menuDivider} />

                                    <Text style={styles.menuSectionHeader}>RESOURCES</Text>

                                    <TouchableOpacity style={styles.menuItem} onPress={() => {
                                        closeMenu();
                                        router.push('/journal');
                                    }}>
                                        <View style={[styles.menuIconBox, { backgroundColor: theme.surfaceElevated }]}>
                                            <BookOpen size={20} color={theme.text} />
                                        </View>
                                        <Text style={styles.menuItemText}>Journal & Notes</Text>
                                        <ChevronRight size={16} color={theme.icon} style={{ marginLeft: 'auto' }} />
                                    </TouchableOpacity>

                                    <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
                                        <View style={[styles.menuIconBox, { backgroundColor: 'rgba(239,68,68,0.16)' }]}>
                                            <LogOut size={20} color="#F87171" />
                                        </View>
                                        <Text style={[styles.menuItemText, { color: '#F87171' }]}>Log Out</Text>
                                    </TouchableOpacity>
                                </ScrollView>

                                <View style={styles.menuFooter}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.menuUser}>{user?.name || 'User'}</Text>
                                        <Text style={styles.menuEmail}>{user?.email || 'No email'}</Text>
                                        <Text style={styles.menuPlan}>{planLabel} · {creditsRemaining}/{MONTHLY_CREDIT_ALLOWANCE} credits</Text>
                                    </View>
                                </View>
                            </SafeAreaView>
                        </LinearGradient>
                    </Animated.View>
                </View>
            </Modal>

            <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity style={styles.iconButton} onPress={openMenu}>
                        <Menu size={24} color={theme.text} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>BYT</Text>
                    <View style={styles.headerRight}>
                        <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/(tabs)/settings')}>
                            <Bell size={24} color={theme.text} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Welcome Card */}
                <LinearGradient
                    colors={['#22D3EE', '#3B82F6', '#2563EB']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.welcomeCard}
                >
                    <Text style={styles.welcomeSub}>{greeting},</Text>
                    <Text style={styles.welcomeTitle}>{user?.name?.split(' ')[0] || 'Friend'}</Text>
                    <Text style={styles.welcomeBody}>
                        {streak > 0
                            ? `You're on a ${streak}-day streak. Your momentum is building — ready to focus today?`
                            : 'A small step today builds the momentum for tomorrow. Where do you want to start?'}
                    </Text>
                </LinearGradient>

                {/* Stats Grid */}
                <View style={styles.statsGrid}>
                    <View style={styles.statCard}>
                        <Text style={styles.statLabel}>ACTIVE GOALS</Text>
                        <Text style={styles.statValue}>{activeGoals}</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statLabel}>AVG PROGRESS</Text>
                        <Text style={styles.statValue}>{goals.length > 0 ? avgProgress : 0}%</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statLabel}>ENTRIES</Text>
                        <View style={styles.streakRow}>
                            <Text style={styles.statValue}>{streak}</Text>
                            <Flame size={20} color="#F97316" fill="#F97316" style={{ marginLeft: 6, marginTop: 4 }} />
                        </View>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statLabel}>COMPLETED</Text>
                        <Text style={styles.statValue}>{goals.filter(g => g.status === 'Completed').length}</Text>
                    </View>
                </View>

                {/* Quick Actions */}
                <Text style={styles.sectionTitle}>QUICK ACTIONS</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.actionsScroll} contentContainerStyle={styles.actionsContainer}>
                    <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/check-in')}>
                        <Sparkles size={20} color={theme.primary} />
                        <Text style={styles.actionText}>Reflect Now</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/(tabs)/goals')}>
                        <CheckCircle size={20} color={theme.primary} />
                        <Text style={styles.actionText}>Set Goal</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/ai-coach')}>
                        <MessageSquare size={20} color={theme.primary} />
                        <Text style={styles.actionText}>Chat with AI</Text>
                    </TouchableOpacity>
                </ScrollView>

                {/* Active Goals */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitleBig}>Active Goals</Text>
                    <TouchableOpacity onPress={() => router.push('/(tabs)/goals')}>
                        <Text style={styles.seeAll}>See All</Text>
                    </TouchableOpacity>
                </View>

                {goals.length === 0 ? (
                    <View style={[styles.card, { alignItems: 'center', paddingVertical: 32 }]}>
                        <Text style={{ color: theme.icon, marginBottom: 8 }}>No active goals yet.</Text>
                        <TouchableOpacity onPress={() => router.push('/(tabs)/goals')}>
                            <Text style={{ color: theme.primary, fontWeight: '600' }}>Create one now</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    goals.slice(0, 3).map((goal) => (
                        <View key={goal.id} style={styles.card}>
                            <View style={styles.goalHeader}>
                                <Text style={styles.goalTitle}>{goal.title}</Text>
                                <Text style={styles.goalPercent}>{goal.progress}%</Text>
                            </View>
                            <Text style={styles.goalSubtitle}>{goal.category}</Text>
                            <View style={styles.progressBarBg}>
                                <View style={[styles.progressBarFill, { width: `${goal.progress}%` }]} />
                            </View>
                        </View>
                    ))
                )}

                <View style={{ height: 100 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const getStyles = (theme: any, isDark: boolean) => StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: theme.background,
        paddingTop: Platform.OS === 'android' ? 40 : 0},
    container: {
        flex: 1},
    contentContainer: {
        paddingHorizontal: 24,
        paddingBottom: 20},
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
        marginTop: 10},
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: theme.text},
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16},
    iconButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: theme.surface,
        justifyContent: 'center',
        alignItems: 'center'},
    welcomeCard: {
        padding: 24,
        borderRadius: 24,
        marginBottom: 24,
        ...shadows.glow},
    welcomeSub: {
        color: 'rgba(255,255,255,0.85)',
        fontSize: 14,
        marginBottom: 4,
        fontWeight: '600',
        letterSpacing: 0.2},
    welcomeTitle: {
        color: '#fff',
        fontSize: 28,
        fontWeight: '800',
        marginBottom: 12,
        letterSpacing: -0.5},
    welcomeBody: {
        color: 'rgba(255,255,255,0.9)',
        fontSize: 16,
        lineHeight: 24},
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 24},
    statCard: {
        width: '48%',
        backgroundColor: theme.card,
        padding: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: theme.border,
        ...shadows.card,
        marginBottom: 12},
    statLabel: {
        fontSize: 12,
        color: theme.textMuted,
        fontWeight: '600',
        marginBottom: 8,
        letterSpacing: 0.5},
    statValue: {
        fontSize: 24,
        fontWeight: '700',
        color: theme.text},
    streakRow: {
        flexDirection: 'row',
        alignItems: 'center'},
    sectionTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: '#64748B',
        marginBottom: 12,
        letterSpacing: 0.5,
        textTransform: 'uppercase'},
    actionsScroll: {
        marginBottom: 24,
        marginHorizontal: -24},
    actionsContainer: {
        paddingHorizontal: 24,
        gap: 12},
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.card,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 24,
        gap: 8,
        borderWidth: 1,
        borderColor: theme.border,
        marginRight: 10},
    actionText: {
        fontSize: 15,
        fontWeight: '600',
        color: theme.text},
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16},
    sectionTitleBig: {
        fontSize: 18,
        fontWeight: '700',
        color: theme.text},
    seeAll: {
        fontSize: 14,
        color: theme.primary,
        fontWeight: '600'},
    card: {
        backgroundColor: theme.card,
        borderRadius: 20,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: theme.border,
        ...shadows.card},
    goalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4},
    goalTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.text,
        flex: 1,
        marginRight: 8},
    goalPercent: {
        fontSize: 14,
        fontWeight: '700',
        color: theme.primary},
    goalSubtitle: {
        fontSize: 13,
        color: '#64748B',
        marginBottom: 12},
    progressBarBg: {
        height: 8,
        backgroundColor: theme.surface,
        borderRadius: 4,
        overflow: 'hidden'},
    progressBarFill: {
        height: '100%',
        backgroundColor: theme.primary,
        borderRadius: 4},
    // Menu Styles
    menuOverlayContainer: {
        flex: 1,
        flexDirection: 'row'},
    menuBackdropTouch: {
        flex: 1},
    menuBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)'},
    menuContainer: {
        width: MENU_WIDTH,
        height: '100%',
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        shadowColor: '#000',
        shadowOffset: { width: 10, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10},
    menuGradient: {
        flex: 1},
    menuSafeArea: {
        flex: 1,
        paddingHorizontal: 22},
    menuHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 20,
        marginBottom: 40},
    menuTitle: {
        fontSize: 24,
        fontWeight: '800',
        color: theme.text,
        letterSpacing: 1},
    menuSubtitle: {
        fontSize: 14,
        color: theme.icon,
        marginTop: 4},
    closeButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
        justifyContent: 'center',
        alignItems: 'center'},
    menuItems: {
        flex: 1},
    menuSectionHeader: {
        fontSize: 12,
        fontWeight: '700',
        color: theme.icon,
        letterSpacing: 1.5,
        marginBottom: 14,
        marginTop: 10},
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 4,
        marginBottom: 6,
        borderRadius: 14},
    menuIconBox: {
        width: 40,
        height: 40,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16},
    menuItemText: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.text},
    menuDivider: {
        height: 1,
        backgroundColor: theme.border,
        marginVertical: 22,
        opacity: 0.55},
    menuFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 20,
        paddingHorizontal: 4,
        borderTopWidth: 1,
        borderTopColor: theme.border,
        gap: 4},
    menuUser: {
        fontSize: 16,
        fontWeight: '700',
        color: theme.text},
    menuEmail: {
        fontSize: 12,
        color: '#64748B',
        marginBottom: 2},
    menuPlan: {
        fontSize: 13,
        color: '#2563EB',
        fontWeight: '600'}});
