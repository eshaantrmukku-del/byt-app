import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import {
  ArrowUpRight,
  Bell,
  ChevronLeft,
  ChevronRight,
  FileText,
  LogOut,
  Mic,
  Sparkles,
  Trash2,
  UserRound,
  type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ACCOUNT_DELETION_URL } from '@/content/privacyPolicy';
import { confirmLogout } from '@/features/session/confirmLogout';
import { logOut } from '@/services/authService';
import { coachClient } from '@/services/coach/coachClient';
import { toCoachError } from '@/services/coach/errors';
import { useCreditsStore } from '@/stores/creditsStore';
import { usePreferencesStore, type PreferenceKey } from '@/stores/preferencesStore';
import { useProfileStore } from '@/stores/profileStore';
import { useSyncStore } from '@/stores/syncStore';
import { MONTHLY_CREDIT_ALLOWANCE } from '@/types/models';
import { theme } from '@/ui';

const COACH_EMAIL = 'venkatareddy.mukku@gmail.com';
const COACH_LINKEDIN = 'https://www.linkedin.com/in/venkata-reddy-mukku-5403246/';

function currentPeriodKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function nextResetLabel(periodKey: string): string {
  const [y, m] = periodKey.split('-').map((x) => Number.parseInt(x, 10));
  if (!y || !m) return '';
  return new Date(y, m, 1).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function ToggleRow({ icon: Icon, label, prefKey }: { icon: LucideIcon; label: string; prefKey: PreferenceKey }) {
  const value = usePreferencesStore((s) => s[prefKey]);
  const set = usePreferencesStore((s) => s.set);
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingLabelContainer}>
        <View style={styles.iconBox}>
          <Icon size={20} color={theme.primary} />
        </View>
        <Text style={styles.settingLabelText}>{label}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={(v) => set(prefKey, v)}
        trackColor={{ false: theme.surfaceElevated, true: theme.primary }}
        thumbColor="#FFF"
        ios_backgroundColor={theme.surfaceElevated}
        accessibilityLabel={label}
      />
    </View>
  );
}

function LinkRow(props: { icon: LucideIcon; label: string; hint?: string; onPress: () => void; danger?: boolean }) {
  const { icon: Icon, label, hint, onPress, danger } = props;
  return (
    <TouchableOpacity style={styles.settingRow} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <View style={[styles.settingLabelContainer, styles.flex]}>
        <View style={[styles.iconBox, danger && styles.dangerIconBox]}>
          <Icon size={20} color={danger ? '#EF4444' : theme.primary} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.settingLabelText}>{label}</Text>
          {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        </View>
      </View>
      <ChevronRight size={18} color={theme.textSecondary} />
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const profile = useProfileStore((s) => s.profile);
  const account = useCreditsStore((s) => s.account);
  const syncError = useSyncStore((s) => s.lastError);

  const [deleting, setDeleting] = useState(false);
  const allowance = account?.monthlyAllowance && account.monthlyAllowance > 0 ? account.monthlyAllowance : MONTHLY_CREDIT_ALLOWANCE;
  const creditsRemaining = account?.creditsRemaining ?? allowance;
  const resetLabel = nextResetLabel(account?.creditsPeriodKey || currentPeriodKey());
  const usedPct = Math.min(100, Math.max(0, Math.round(((allowance - creditsRemaining) / allowance) * 100)));

  const deleteAccount = () => {
    // Web alerts don't confirm, so keep the hosted request page there.
    if (Platform.OS === 'web') {
      void Linking.openURL(ACCOUNT_DELETION_URL);
      return;
    }
    Alert.alert('Delete account & data', 'This permanently removes your account and stored data.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (deleting) return;
          setDeleting(true);
          void coachClient
            .deleteAccount()
            .then(() => logOut({ force: true }))
            .catch((error: unknown) => {
              const coachError = toCoachError(error);
              if (coachError.reason === 'not-deployed' || coachError.reason === 'network') {
                void Linking.openURL(ACCOUNT_DELETION_URL);
                return;
              }
              Alert.alert('Couldn’t delete the account', coachError.message);
            })
            .finally(() => setDeleting(false));
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ChevronLeft size={28} color={theme.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Settings</Text>

        {syncError ? <Text style={styles.syncError}>{syncError}</Text> : null}

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>PREFERENCES</Text>
          <ToggleRow icon={Mic} label="Voice Interaction" prefKey="voiceInteraction" />
          <ToggleRow icon={Sparkles} label="Smart Nudges" prefKey="smartNudges" />
          <ToggleRow icon={Bell} label="Push Notifications" prefKey="pushNotifications" />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>SUBSCRIPTION</Text>
          <View style={styles.subscriptionCard}>
            <View style={styles.subHeaderRow}>
              <View style={styles.flex}>
                <Text style={styles.subTitle}>BYT Beta</Text>
                <Text style={styles.subSubtitle}>Credits reset monthly</Text>
              </View>
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>ACTIVE</Text>
              </View>
            </View>
            <View style={styles.creditsHeader}>
              <Text style={styles.creditsLabel}>Remaining credits</Text>
              <Text style={styles.creditsValue}>
                {creditsRemaining} / {allowance}
              </Text>
            </View>
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, { width: `${usedPct}%` }]} />
            </View>
            <Text style={styles.progressInfo}>Next reset on {resetLabel}</Text>
            <Text style={styles.creditHint}>
              You receive {MONTHLY_CREDIT_ALLOWANCE} credits at the start of each calendar month. Each message you send to
              the coach uses 1 credit; coach replies do not.
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>WORK WITH A HUMAN COACH</Text>
          <View style={styles.humanCoachCard}>
            <Text style={styles.humanCoachIntro}>If you&apos;d prefer to work with a real coach, you can reach out here:</Text>
            <TouchableOpacity onPress={() => void Linking.openURL(`mailto:${COACH_EMAIL}`)} accessibilityRole="link">
              <Text style={styles.linkLine}>{COACH_EMAIL}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => void Linking.openURL(COACH_LINKEDIN)} accessibilityRole="link">
              <Text style={styles.linkLine}>{COACH_LINKEDIN}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>ACCOUNT</Text>
          <View style={styles.accountItem}>
            <Text style={styles.accountLabel}>Email Address</Text>
            <Text style={styles.accountValue}>{profile?.email || 'Not set'}</Text>
          </View>
          <View style={styles.accountItem}>
            <Text style={styles.accountLabel}>Name</Text>
            <Text style={styles.accountValue}>{profile?.displayName || 'Not set'}</Text>
          </View>
          <LinkRow
            icon={UserRound}
            label="Edit personal info"
            hint="Date of birth, profession, goals, and coach notes"
            onPress={() => router.push('/edit-profile')}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>LEGAL</Text>
          <LinkRow icon={FileText} label="Privacy Policy" onPress={() => router.push('/privacy')} />
          <LinkRow
            icon={Trash2}
            label="Delete account & data"
            hint="Request removal of your account and stored data"
            danger
            onPress={deleteAccount}
          />
        </View>

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => confirmLogout('You will return to the login screen so you can use another account.')}
          accessibilityRole="button"
          accessibilityLabel="Log Out"
        >
          <Text style={styles.logoutText}>Log Out</Text>
          <LogOut size={20} color="#EF4444" />
        </TouchableOpacity>

        <View style={styles.footer}>
          <View style={styles.logoRow}>
            <View style={styles.logoIcon}>
              <ArrowUpRight size={16} color="#FFF" />
            </View>
            <Text style={styles.logoText}>BYT</Text>
          </View>
          <Text style={styles.versionText}>Version {Constants.expoConfig?.version ?? ''}</Text>
        </View>

        <View style={styles.bottomSpace} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: theme.background },
  header: { paddingHorizontal: 16, paddingTop: 12 },
  backButton: { padding: 4, alignSelf: 'flex-start' },
  contentContainer: { paddingHorizontal: 24, paddingTop: 12 },
  title: { fontSize: 34, fontWeight: '800', color: theme.text, marginBottom: 32 },
  syncError: { color: '#F87171', fontSize: 14, marginTop: -16, marginBottom: 24 },
  section: { marginBottom: 32 },
  sectionHeader: { fontSize: 13, fontWeight: '700', color: theme.textSecondary, marginBottom: 16, letterSpacing: 1 },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 8 },
  settingLabelContainer: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  iconBox: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.primarySoft },
  dangerIconBox: { backgroundColor: 'rgba(239,68,68,0.12)' },
  settingLabelText: { fontSize: 16, fontWeight: '600', color: theme.text },
  hint: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  subscriptionCard: { backgroundColor: theme.card, borderRadius: 24, padding: 24, borderWidth: 1, borderColor: theme.border },
  subHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  subTitle: { fontSize: 20, fontWeight: '700', color: theme.text, marginBottom: 4 },
  subSubtitle: { fontSize: 14, color: '#64748B' },
  activeBadge: { backgroundColor: 'rgba(34,197,94,0.16)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  activeBadgeText: { color: '#4ADE80', fontSize: 12, fontWeight: '800' },
  creditsHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  creditsLabel: { fontSize: 15, fontWeight: '600', color: theme.text },
  creditsValue: { fontSize: 15, fontWeight: '800', color: theme.text },
  progressBg: { height: 8, backgroundColor: theme.surfaceElevated, borderRadius: 4, marginBottom: 8, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: theme.primary },
  progressInfo: { fontSize: 12, color: '#64748B', marginBottom: 6 },
  creditHint: { fontSize: 12, color: '#94A3B8', lineHeight: 18 },
  humanCoachCard: { backgroundColor: theme.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: theme.border },
  humanCoachIntro: { fontSize: 15, color: theme.text, marginBottom: 14, lineHeight: 22 },
  linkLine: { fontSize: 14, color: theme.primary, fontWeight: '600', marginBottom: 10 },
  accountItem: { marginBottom: 24 },
  accountLabel: { fontSize: 14, color: '#94A3B8', marginBottom: 6 },
  accountValue: { fontSize: 18, fontWeight: '600', color: theme.text },
  logoutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16, marginBottom: 40 },
  logoutText: { color: '#EF4444', fontSize: 18, fontWeight: '600' },
  footer: { alignItems: 'center', gap: 12 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#00D1FF', justifyContent: 'center', alignItems: 'center' },
  logoText: { fontSize: 22, fontWeight: '700', color: '#94A3B8', letterSpacing: -0.5 },
  versionText: { fontSize: 12, color: '#94A3B8' },
  bottomSpace: { height: 40 },
});
