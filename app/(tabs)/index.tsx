import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import {
  Bell,
  BookOpen,
  Brain,
  CheckCircle,
  ChevronRight,
  Flame,
  LogOut,
  Menu,
  MessageSquare,
  Sparkles,
  TrendingUp,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { computeStreaks } from '@/features/checkIns/checkIns';
import { localDateKey } from '@/features/dates';
import { CATEGORY_LABELS } from '@/features/goals/goals';
import { confirmLogout, showCoachComingSoon } from '@/features/session/confirmLogout';
import { useCreditsStore } from '@/stores/creditsStore';
import { useProfileStore } from '@/stores/profileStore';
import { useUserDataStore } from '@/stores/userDataStore';
import { MONTHLY_CREDIT_ALLOWANCE } from '@/types/models';
import { shadows, theme } from '@/ui';

const MENU_WIDTH = Dimensions.get('window').width * 0.82;
const USE_NATIVE = Platform.OS !== 'web';

function greetingFor(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

type MenuItemProps = { icon: LucideIcon; color: string; bg: string; label: string; onPress: () => void; danger?: boolean };

function MenuItem({ icon: Icon, color, bg, label, onPress, danger }: MenuItemProps) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <View style={[styles.menuIconBox, { backgroundColor: bg }]}>
        <Icon size={20} color={color} />
      </View>
      <Text style={[styles.menuItemText, danger && { color: '#F87171' }]}>{label}</Text>
      {danger ? null : <ChevronRight size={16} color={theme.icon} style={styles.chevron} />}
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const profile = useProfileStore((s) => s.profile);
  const goals = useUserDataStore((s) => s.goals.items);
  const checkIns = useUserDataStore((s) => s.checkIns.items);
  const credits = useCreditsStore((s) => s.account?.creditsRemaining ?? MONTHLY_CREDIT_ALLOWANCE);

  const [menuVisible, setMenuVisible] = useState(false);
  const [slide] = useState(() => new Animated.Value(-MENU_WIDTH));
  const [fade] = useState(() => new Animated.Value(0));

  const openMenu = () => {
    setMenuVisible(true);
    slide.setValue(-MENU_WIDTH);
    fade.setValue(0);
    Animated.parallel([
      Animated.spring(slide, { toValue: 0, useNativeDriver: USE_NATIVE, tension: 56, friction: 11 }),
      Animated.timing(fade, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: USE_NATIVE }),
    ]).start();
  };

  const closeMenu = (then?: () => void) => {
    Animated.parallel([
      Animated.timing(slide, { toValue: -MENU_WIDTH, duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: USE_NATIVE }),
      Animated.timing(fade, { toValue: 0, duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: USE_NATIVE }),
    ]).start(() => {
      setMenuVisible(false);
      then?.();
    });
  };

  const go = (action: () => void) => () => closeMenu(action);

  const name = profile?.displayName || 'User';
  const firstName = profile?.displayName.split(' ')[0] || 'Friend';
  const streak = computeStreaks(
    checkIns.map((c) => c.id),
    localDateKey()
  ).current;
  const activeGoals = goals.filter((g) => g.status !== 'completed');
  const avgProgress = goals.length ? Math.round(goals.reduce((sum, g) => sum + g.progress, 0) / goals.length) : 0;
  const completed = goals.length - activeGoals.length;
  const homeGoals = [...activeGoals].sort((a, b) => a.createdAt - b.createdAt).slice(0, 3);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <Modal transparent visible={menuVisible} onRequestClose={() => closeMenu()} animationType="none" statusBarTranslucent>
        <View style={styles.menuOverlay}>
          <TouchableOpacity activeOpacity={1} style={styles.flex} onPress={() => closeMenu()} accessibilityLabel="Close menu">
            <Animated.View style={[styles.menuBackdrop, { opacity: fade }]} />
          </TouchableOpacity>

          <Animated.View style={[styles.menuContainer, { transform: [{ translateX: slide }] }]}>
            <LinearGradient colors={['#1e293b', '#0f172a']} style={styles.flex}>
              <SafeAreaView style={styles.menuSafeArea}>
                <View style={styles.menuHeader}>
                  <View>
                    <Text style={styles.menuTitle}>BYT</Text>
                    <Text style={styles.menuSubtitle}>Build Your Tomorrow</Text>
                  </View>
                  <TouchableOpacity onPress={() => closeMenu()} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close menu">
                    <X size={24} color={theme.text} />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.flex} showsVerticalScrollIndicator={false}>
                  <Text style={styles.menuSectionHeader}>TOOLS</Text>
                  <MenuItem icon={CheckCircle} color="#60A5FA" bg="rgba(59,130,246,0.16)" label="Daily Check-In" onPress={go(() => router.push('/check-in'))} />
                  <MenuItem icon={Brain} color="#A78BFA" bg="rgba(124,58,237,0.16)" label="Chat with AI" onPress={go(showCoachComingSoon)} />
                  <MenuItem icon={TrendingUp} color="#22D3EE" bg="rgba(34,211,238,0.16)" label="My Goals" onPress={go(() => router.push('/goals'))} />
                  <MenuItem icon={Sparkles} color="#FBBF24" bg="rgba(245,158,11,0.16)" label="Reflect Now" onPress={go(() => router.push('/check-in'))} />

                  <View style={styles.menuDivider} />

                  <Text style={styles.menuSectionHeader}>RESOURCES</Text>
                  <MenuItem icon={BookOpen} color={theme.text} bg={theme.surfaceElevated} label="Journal & Notes" onPress={go(() => router.push('/journal'))} />
                  <MenuItem
                    icon={LogOut}
                    color="#F87171"
                    bg="rgba(239,68,68,0.16)"
                    label="Log Out"
                    danger
                    onPress={go(() => confirmLogout('You can sign in with a different account afterward.'))}
                  />
                </ScrollView>

                <View style={styles.menuFooter}>
                  <Text style={styles.menuUser}>{name}</Text>
                  <Text style={styles.menuEmail}>{profile?.email || 'No email'}</Text>
                  <Text style={styles.menuPlan}>
                    Beta · {credits}/{MONTHLY_CREDIT_ALLOWANCE} credits
                  </Text>
                </View>
              </SafeAreaView>
            </LinearGradient>
          </Animated.View>
        </View>
      </Modal>

      <ScrollView style={styles.flex} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconButton} onPress={openMenu} accessibilityRole="button" accessibilityLabel="Open menu">
            <Menu size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>BYT</Text>
          <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel="Notifications and settings">
            <Bell size={24} color={theme.text} />
          </TouchableOpacity>
        </View>

        <LinearGradient colors={['#22D3EE', '#3B82F6', '#2563EB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.welcomeCard}>
          <Text style={styles.welcomeSub}>{greetingFor(new Date().getHours())},</Text>
          <Text style={styles.welcomeTitle}>{firstName}</Text>
          <Text style={styles.welcomeBody}>
            {streak > 0
              ? `You're on a ${streak}-day streak. Your momentum is building — ready to focus today?`
              : 'A small step today builds the momentum for tomorrow. Where do you want to start?'}
          </Text>
        </LinearGradient>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>ACTIVE GOALS</Text>
            <Text style={styles.statValue}>{activeGoals.length}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>AVG PROGRESS</Text>
            <Text style={styles.statValue}>{avgProgress}%</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>DAY STREAK</Text>
            <View style={styles.streakRow}>
              <Text style={styles.statValue}>{streak}</Text>
              <Flame size={20} color="#F97316" fill="#F97316" style={styles.flame} />
            </View>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>COMPLETED</Text>
            <Text style={styles.statValue}>{completed}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>QUICK ACTIONS</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.actionsScroll} contentContainerStyle={styles.actionsContainer}>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/check-in')} accessibilityRole="button">
            <Sparkles size={20} color={theme.primary} />
            <Text style={styles.actionText}>Reflect Now</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/goals')} accessibilityRole="button">
            <CheckCircle size={20} color={theme.primary} />
            <Text style={styles.actionText}>Set Goal</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={showCoachComingSoon} accessibilityRole="button">
            <MessageSquare size={20} color={theme.primary} />
            <Text style={styles.actionText}>Chat with AI</Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitleBig}>Active Goals</Text>
          <TouchableOpacity onPress={() => router.push('/goals')} accessibilityRole="button">
            <Text style={styles.seeAll}>See All</Text>
          </TouchableOpacity>
        </View>

        {homeGoals.length === 0 ? (
          <View style={[styles.card, styles.emptyCard]}>
            <Text style={styles.emptyText}>No active goals yet.</Text>
            <TouchableOpacity onPress={() => router.push('/goals')} accessibilityRole="button">
              <Text style={styles.emptyLink}>Create one now</Text>
            </TouchableOpacity>
          </View>
        ) : (
          homeGoals.map((goal) => (
            <View key={goal.id} style={styles.card}>
              <View style={styles.goalHeader}>
                <Text style={styles.goalTitle}>{goal.title}</Text>
                <Text style={styles.goalPercent}>{goal.progress}%</Text>
              </View>
              <Text style={styles.goalSubtitle}>{CATEGORY_LABELS[goal.category]}</Text>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${goal.progress}%` }]} />
              </View>
            </View>
          ))
        )}

        <View style={styles.bottomSpace} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: theme.background },
  contentContainer: { paddingHorizontal: 24, paddingBottom: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, marginTop: 10 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: theme.text },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeCard: { padding: 24, borderRadius: 24, marginBottom: 24, ...shadows.glow },
  welcomeSub: { color: 'rgba(255,255,255,0.85)', fontSize: 14, marginBottom: 4, fontWeight: '600', letterSpacing: 0.2 },
  welcomeTitle: { color: '#fff', fontSize: 28, fontWeight: '800', marginBottom: 12, letterSpacing: -0.5 },
  welcomeBody: { color: 'rgba(255,255,255,0.9)', fontSize: 16, lineHeight: 24 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 12 },
  statCard: {
    width: '48%',
    backgroundColor: theme.card,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.border,
    ...shadows.card,
    marginBottom: 12,
  },
  statLabel: { fontSize: 12, color: theme.textMuted, fontWeight: '600', marginBottom: 8, letterSpacing: 0.5 },
  statValue: { fontSize: 24, fontWeight: '700', color: theme.text },
  streakRow: { flexDirection: 'row', alignItems: 'center' },
  flame: { marginLeft: 6, marginTop: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#64748B', marginBottom: 12, letterSpacing: 0.5, textTransform: 'uppercase' },
  actionsScroll: { marginBottom: 24, marginHorizontal: -24 },
  actionsContainer: { paddingHorizontal: 24, gap: 12 },
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
  },
  actionText: { fontSize: 15, fontWeight: '600', color: theme.text },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitleBig: { fontSize: 18, fontWeight: '700', color: theme.text },
  seeAll: { fontSize: 14, color: theme.primary, fontWeight: '600' },
  card: {
    backgroundColor: theme.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.border,
    ...shadows.card,
  },
  emptyCard: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { color: theme.icon, marginBottom: 8 },
  emptyLink: { color: theme.primary, fontWeight: '600' },
  goalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  goalTitle: { fontSize: 16, fontWeight: '600', color: theme.text, flex: 1, marginRight: 8 },
  goalPercent: { fontSize: 14, fontWeight: '700', color: theme.primary },
  goalSubtitle: { fontSize: 13, color: '#64748B', marginBottom: 12 },
  progressBarBg: { height: 8, backgroundColor: theme.surface, borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: theme.primary, borderRadius: 4 },
  bottomSpace: { height: 100 },
  menuOverlay: { flex: 1, flexDirection: 'row' },
  menuBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.5)' },
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
    elevation: 10,
  },
  menuSafeArea: { flex: 1, paddingHorizontal: 22 },
  menuHeader: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, marginBottom: 40 },
  menuTitle: { fontSize: 24, fontWeight: '800', color: theme.text, letterSpacing: 1 },
  menuSubtitle: { fontSize: 14, color: theme.icon, marginTop: 4 },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuSectionHeader: { fontSize: 12, fontWeight: '700', color: theme.icon, letterSpacing: 1.5, marginBottom: 14, marginTop: 10 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4, marginBottom: 6, borderRadius: 14 },
  menuIconBox: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  menuItemText: { fontSize: 16, fontWeight: '600', color: theme.text },
  chevron: { marginLeft: 'auto' },
  menuDivider: { height: 1, backgroundColor: theme.border, marginVertical: 22, opacity: 0.55 },
  menuFooter: { paddingVertical: 20, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: theme.border, gap: 2 },
  menuUser: { fontSize: 16, fontWeight: '700', color: theme.text },
  menuEmail: { fontSize: 12, color: '#64748B', marginBottom: 2 },
  menuPlan: { fontSize: 13, color: '#2563EB', fontWeight: '600' },
});
