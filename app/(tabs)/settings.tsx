import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Linking,
} from 'react-native';
import { theme } from '@/constants/theme';
import { MONTHLY_CREDIT_ALLOWANCE, useStore } from '@/store/useStore';
import { auth } from '@/services/firebase';
import { flushUserFirestoreNow } from '@/services/userFirestoreCoordinator';
import { ChevronLeft, Mic, Sparkles, Bell, LogOut, ArrowUpRight, FileText, Trash2, UserRound } from 'lucide-react-native';
import { signOut } from 'firebase/auth';
import { useRouter } from 'expo-router';
import { ACCOUNT_DELETION_URL } from '@/constants/privacyPolicy';

const COACH_EMAIL = 'venkatareddy.mukku@gmail.com';
const COACH_LINKEDIN = 'https://www.linkedin.com/in/venkata-reddy-mukku-5403246/';

function nextResetLabel(periodKey: string): string {
  const [yStr, mStr] = periodKey.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  if (!y || !m) return '';
  const next = new Date(y, m, 1);
  return next.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function SettingsScreen() {
  const router = useRouter();
  const {
    user,
    logout,
    creditsRemaining,
    creditsPeriodKey,
    ensureCreditsForCurrentMonth,
  } = useStore();

  useEffect(() => {
    ensureCreditsForCurrentMonth();
  }, [ensureCreditsForCurrentMonth]);

  const resetLabel = useMemo(() => nextResetLabel(creditsPeriodKey), [creditsPeriodKey]);
  const usedPct = Math.min(
    100,
    Math.round(((MONTHLY_CREDIT_ALLOWANCE - creditsRemaining) / MONTHLY_CREDIT_ALLOWANCE) * 100)
  );

  const handleLogout = () => {
    Alert.alert('Log out?', 'You will return to the login screen so you can use another account.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: () => void performLogout(),
      },
    ]);
  };

  const performLogout = async () => {
    try {
      // Push chats/goals before auth teardown so the session is not lost.
      await flushUserFirestoreNow();
      if (auth) {
        await signOut(auth);
      }
      logout();
      router.replace('/auth/login');
    } catch (error: any) {
      Alert.alert('Logout Failed', error.message || 'Please try again.');
    }
  };

  const [voiceInteraction, setVoiceInteraction] = useState(true);
  const [smartNudges, setSmartNudges] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(false);

  const styles = getStyles(theme);

  const SettingRow = ({ icon: Icon, label, value, onValueChange, showToggle = true }: any) => (
    <View style={styles.settingRow}>
      <View style={styles.settingLabelContainer}>
        <View style={styles.iconBox}>
          <Icon size={20} color={theme.primary} />
        </View>
        <Text style={styles.settingLabelText}>{label}</Text>
      </View>
      {showToggle && (
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: theme.surfaceElevated, true: theme.primary }}
          thumbColor="#FFF"
          ios_backgroundColor={theme.surfaceElevated}
        />
      )}
    </View>
  );

  const planTitle = 'BYT Beta';

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={28} color={theme.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Settings</Text>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>PREFERENCES</Text>
          <SettingRow
            icon={Mic}
            label="Voice Interaction"
            value={voiceInteraction}
            onValueChange={setVoiceInteraction}
          />
          <SettingRow icon={Sparkles} label="Smart Nudges" value={smartNudges} onValueChange={setSmartNudges} />
          <SettingRow
            icon={Bell}
            label="Push Notifications"
            value={pushNotifications}
            onValueChange={setPushNotifications}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>SUBSCRIPTION</Text>
          <View style={styles.subscriptionCard}>
            <View style={styles.subHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.subTitle}>{planTitle}</Text>
                <Text style={styles.subSubtitle}>Credits reset monthly</Text>
              </View>
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>ACTIVE</Text>
              </View>
            </View>

            <View style={styles.creditsContainer}>
              <View style={styles.creditsHeader}>
                <Text style={styles.creditsLabel}>Remaining credits</Text>
                <Text style={styles.creditsValue}>
                  {creditsRemaining} / {MONTHLY_CREDIT_ALLOWANCE}
                </Text>
              </View>
              <View style={styles.progressBg}>
                <View style={[styles.progressFill, { width: `${usedPct}%`, backgroundColor: theme.primary }]} />
              </View>
              <Text style={styles.progressInfo}>Next reset on {resetLabel}</Text>
              <Text style={styles.creditHint}>
                You receive {MONTHLY_CREDIT_ALLOWANCE} credits at the start of each calendar month. Each message
                you send to the coach uses 1 credit; coach replies do not.
              </Text>
            </View>

          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>WORK WITH A HUMAN COACH</Text>
          <View style={styles.humanCoachCard}>
            <Text style={styles.humanCoachIntro}>
              {"If you'd prefer to work with a real coach, you can reach out here:"}
            </Text>
            <TouchableOpacity onPress={() => void Linking.openURL(`mailto:${COACH_EMAIL}`)}>
              <Text style={styles.linkLine}>{COACH_EMAIL}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => void Linking.openURL(COACH_LINKEDIN)}>
              <Text style={styles.linkLine}>{COACH_LINKEDIN}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>ACCOUNT</Text>

          <View style={styles.accountItem}>
            <Text style={styles.accountLabel}>Email Address</Text>
            <Text style={styles.accountValue}>{user?.email || 'Not set'}</Text>
          </View>

          <View style={styles.accountItem}>
            <Text style={styles.accountLabel}>Name</Text>
            <Text style={styles.accountValue}>{user?.name || 'Not set'}</Text>
          </View>

          <TouchableOpacity style={styles.settingRow} onPress={() => router.push('/edit-profile')}>
            <View style={styles.settingLabelContainer}>
              <View style={styles.iconBox}>
                <UserRound size={20} color={theme.primary} />
              </View>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.settingLabelText}>Edit personal info</Text>
                <Text style={styles.deleteHint}>Date of birth, profession, goals, and coach notes</Text>
              </View>
            </View>
            <ChevronLeft
              size={18}
              color={theme.textSecondary}
              style={{ transform: [{ rotate: '180deg' }] }}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>LEGAL</Text>
          <TouchableOpacity style={styles.settingRow} onPress={() => router.push('/privacy')}>
            <View style={styles.settingLabelContainer}>
              <View style={styles.iconBox}>
                <FileText size={20} color={theme.primary} />
              </View>
              <Text style={styles.settingLabelText}>Privacy Policy</Text>
            </View>
            <ChevronLeft
              size={18}
              color={theme.textSecondary}
              style={{ transform: [{ rotate: '180deg' }] }}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => void Linking.openURL(ACCOUNT_DELETION_URL)}
          >
            <View style={styles.settingLabelContainer}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
                <Trash2 size={20} color="#EF4444" />
              </View>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.settingLabelText}>Delete account & data</Text>
                <Text style={styles.deleteHint}>Request removal of your account and stored data</Text>
              </View>
            </View>
            <ChevronLeft
              size={18}
              color={theme.textSecondary}
              style={{ transform: [{ rotate: '180deg' }] }}
            />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
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
          <Text style={styles.versionText}>Version 2.4.0 (1002)</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (theme: typeof import('@/constants/theme').theme) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.background,
    },
    header: {
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    backButton: {
      padding: 4,
    },
    container: {
      flex: 1,
    },
    contentContainer: {
      paddingHorizontal: 24,
      paddingTop: 12,
    },
    title: {
      fontSize: 34,
      fontWeight: '800',
      color: theme.text,
      marginBottom: 32,
    },
    section: {
      marginBottom: 32,
    },
    sectionHeader: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.textSecondary,
      marginBottom: 16,
      letterSpacing: 1,
    },
    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 20,
    },
    settingLabelContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    iconBox: {
      width: 40,
      height: 40,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.primarySoft,
    },
    settingLabelText: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.text,
    },
    deleteHint: {
      fontSize: 12,
      color: theme.textSecondary,
      marginTop: 2,
    },
    subscriptionCard: {
      backgroundColor: theme.card,
      borderRadius: 24,
      padding: 24,
      borderWidth: 1,
      borderColor: theme.border,
    },
    subHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 24,
    },
    subTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.text,
      marginBottom: 4,
    },
    subSubtitle: {
      fontSize: 14,
      color: '#64748B',
    },
    activeBadge: {
      backgroundColor: 'rgba(34,197,94,0.16)',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
    },
    activeBadgeText: {
      color: '#4ADE80',
      fontSize: 12,
      fontWeight: '800',
    },
    creditsContainer: {
      marginBottom: 16,
    },
    creditsHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    creditsLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.text,
    },
    creditsValue: {
      fontSize: 15,
      fontWeight: '800',
      color: theme.text,
    },
    progressBg: {
      height: 8,
      backgroundColor: theme.surfaceElevated,
      borderRadius: 4,
      marginBottom: 8,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 4,
    },
    progressInfo: {
      fontSize: 12,
      color: '#64748B',
      marginBottom: 6,
    },
    creditHint: {
      fontSize: 12,
      color: '#94A3B8',
      lineHeight: 18,
    },
    humanCoachCard: {
      backgroundColor: theme.card,
      borderRadius: 20,
      padding: 20,
      borderWidth: 1,
      borderColor: theme.border,
    },
    humanCoachIntro: {
      fontSize: 15,
      color: theme.text,
      marginBottom: 14,
      lineHeight: 22,
    },
    linkLine: {
      fontSize: 14,
      color: theme.primary,
      fontWeight: '600',
      marginBottom: 10,
    },
    accountItem: {
      marginBottom: 24,
    },
    accountLabel: {
      fontSize: 14,
      color: '#94A3B8',
      marginBottom: 6,
    },
    accountValue: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.text,
    },
    logoutButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      marginTop: 16,
      marginBottom: 40,
    },
    logoutText: {
      color: '#EF4444',
      fontSize: 18,
      fontWeight: '600',
    },
    footer: {
      alignItems: 'center',
      gap: 12,
    },
    logoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    logoIcon: {
      width: 28,
      height: 28,
      borderRadius: 8,
      backgroundColor: '#00D1FF',
      justifyContent: 'center',
      alignItems: 'center',
    },
    logoText: {
      fontSize: 22,
      fontWeight: '700',
      color: '#94A3B8',
      letterSpacing: -0.5,
    },
    versionText: {
      fontSize: 12,
      color: '#94A3B8',
    },
  });
