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
import { currentAccount, percentLeft, resetLabel } from '@/features/usage/usage';
import type { CoachThinking } from '@/services/coach/types';
import { usePreferencesStore, type PreferenceKey } from '@/stores/preferencesStore';
import { requestNotificationPermission } from '@/services/notifications';
import { useProfileStore } from '@/stores/profileStore';
import { useSyncStore } from '@/stores/syncStore';
import { useUsageStore } from '@/stores/usageStore';
import { theme } from '@/ui';

const COACH_EMAIL = 'venkatareddy.mukku@gmail.com';
const COACH_LINKEDIN = 'https://www.linkedin.com/in/venkata-reddy-mukku-5403246/';

const THINKING_OPTIONS: { value: CoachThinking; label: string; hint: string }[] = [
  { value: 'standard', label: 'Standard', hint: 'Thoughtful replies at conversation pace.' },
  { value: 'deeper', label: 'Deeper', hint: 'Takes a little longer to reflect before replying.' },
  { value: 'deepest', label: 'Deepest', hint: 'Slowest, most considered replies. Uses more of your daily allowance.' },
];

function ThinkingPicker() {
  const value = usePreferencesStore((s) => s.coachThinking);
  const setValue = usePreferencesStore((s) => s.setCoachThinking);
  const selected = THINKING_OPTIONS.find((o) => o.value === value) ?? THINKING_OPTIONS[0]!;
  return (
    <View>
      <View style={styles.segment} accessibilityRole="radiogroup" accessibilityLabel="Coach thinking">
        {THINKING_OPTIONS.map((option) => {
          const active = option.value === selected.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.segmentItem, active && styles.segmentItemActive]}
              onPress={() => setValue(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={option.label}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.segmentHint}>{selected.hint}</Text>
    </View>
  );
}

const REMINDER_HOURS: { hour: number; label: string }[] = [
  { hour: 8, label: '8 am' },
  { hour: 12, label: '12 pm' },
  { hour: 18, label: '6 pm' },
  { hour: 20, label: '8 pm' },
];

function ReminderTimePicker() {
  const value = usePreferencesStore((s) => s.reminderHour);
  const setValue = usePreferencesStore((s) => s.setReminderHour);
  return (
    <View style={styles.reminderTimes}>
      <View style={styles.segment} accessibilityRole="radiogroup" accessibilityLabel="Check-in reminder time">
        {REMINDER_HOURS.map((option) => {
          const active = option.hour === value;
          return (
            <TouchableOpacity
              key={option.hour}
              style={[styles.segmentItem, active && styles.segmentItemActive]}
              onPress={() => setValue(option.hour)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={option.label}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.segmentHint}>Skipped on days you’ve already checked in.</Text>
    </View>
  );
}

/** Notification toggles need the system permission; ask when one is switched on. */
async function enableNotifications(): Promise<boolean> {
  const status = await requestNotificationPermission();
  if (status === 'granted') return true;
  Alert.alert('Notifications are off for BYT', 'To get reminders, allow notifications for BYT in your phone’s settings.', [
    { text: 'Not now', style: 'cancel' },
    { text: 'Open settings', onPress: () => void Linking.openSettings() },
  ]);
  return false;
}

function ToggleRow(props: { icon: LucideIcon; label: string; hint?: string; prefKey: PreferenceKey; notification?: boolean }) {
  const { icon: Icon, label, hint, prefKey, notification } = props;
  const value = usePreferencesStore((s) => s[prefKey]);
  const set = usePreferencesStore((s) => s.set);
  const onChange = (next: boolean) => {
    if (!next || !notification || Platform.OS === 'web') return set(prefKey, next);
    void enableNotifications().then((ok) => ok && set(prefKey, true));
  };
  return (
    <View style={styles.settingRow}>
      <View style={[styles.settingLabelContainer, styles.flex]}>
        <View style={styles.iconBox}>
          <Icon size={20} color={theme.primary} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.settingLabelText}>{label}</Text>
          {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
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
  const account = currentAccount(useUsageStore((s) => s.account));
  const syncError = useSyncStore((s) => s.lastError);
  const checkInReminders = usePreferencesStore((s) => s.pushNotifications);

  const [deleting, setDeleting] = useState(false);
  const left = percentLeft(account);

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
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>REMINDERS</Text>
          <ToggleRow icon={Bell} label="Daily check-in reminder" prefKey="pushNotifications" notification />
          {checkInReminders ? <ReminderTimePicker /> : null}
          <ToggleRow
            icon={Sparkles}
            label="Coach nudges"
            hint="On the day you said you’d do something, and a follow-up after"
            prefKey="smartNudges"
            notification
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>COACH THINKING</Text>
          <ThinkingPicker />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>SUBSCRIPTION</Text>
          <View style={styles.subscriptionCard}>
            <View style={styles.subHeaderRow}>
              <View style={styles.flex}>
                <Text style={styles.subTitle}>BYT Beta</Text>
                <Text style={styles.subSubtitle}>Coaching allowance resets daily</Text>
              </View>
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>ACTIVE</Text>
              </View>
            </View>
            <View style={styles.creditsHeader}>
              <Text style={styles.creditsLabel}>Today&apos;s coaching</Text>
              <Text style={styles.creditsValue}>{left}% left</Text>
            </View>
            <View style={styles.progressBg} accessibilityLabel={`${left} percent of today's coaching left`}>
              <View style={[styles.progressFill, { width: `${left}%` }]} />
            </View>
            <Text style={styles.progressInfo}>Resets {resetLabel(account.resetsAt)}</Text>
            <Text style={styles.creditHint}>
              Each message and voice turn uses part of your daily allowance; longer conversations and deeper thinking use
              more. Opening a session doesn&apos;t count, and nothing is used if a reply fails.
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
  segment: { flexDirection: 'row', backgroundColor: theme.card, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: theme.border },
  segmentItem: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  segmentItemActive: { backgroundColor: theme.primary },
  segmentText: { fontSize: 14, fontWeight: '600', color: theme.textSecondary },
  segmentTextActive: { color: '#FFF' },
  reminderTimes: { marginTop: 4, marginBottom: 16 },
  segmentHint: { fontSize: 12, color: theme.textSecondary, marginTop: 10, lineHeight: 18 },
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
