import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight, Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { draftFromProfile, resolveDraft, type ProfileDraft } from '@/features/profile/draft';
import { diffProfileFields, EMPTY_PROFILE_FIELDS } from '@/features/profile/profileDoc';
import { PROFILE_LIMITS } from '@/features/profile/validation';
import { saveProfileChanges } from '@/services/profileService';
import { useProfileStore } from '@/stores/profileStore';
import { authTheme } from '@/ui';
import { DobInputs, IntakeField, intakeStyles } from '@/ui/intake';

export default function OnboardingScreen() {
  const profile = useProfileStore((s) => s.profile);
  const uid = useProfileStore((s) => s.uid);
  const [draft, setDraft] = useState<ProfileDraft>(() => draftFromProfile(profile ?? EMPTY_PROFILE_FIELDS));
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof ProfileDraft>(key: K) => (value: ProfileDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const handleComplete = async () => {
    if (!uid || !profile) return;
    const dob = resolveDraft(draft, ['dateOfBirth']);
    if (dob.errors.dateOfBirth) {
      Alert.alert('Date of birth', dob.errors.dateOfBirth);
      return;
    }
    if (!draft.profession.trim() || !draft.goalsSummary.trim()) {
      Alert.alert('Required fields', 'Please add your profession and goals so your coach can personalize your experience.');
      return;
    }
    const { fields, errors } = resolveDraft(draft, [
      'dateOfBirth',
      'profession',
      'goalsSummary',
      'income',
      'lifestyle',
      'struggles',
      'coachNotes',
    ]);
    const firstError = Object.values(errors)[0];
    if (firstError) {
      Alert.alert('Check your details', firstError);
      return;
    }

    setSubmitting(true);
    try {
      const changes = diffProfileFields(profile, { ...profile, ...fields });
      await saveProfileChanges(uid, { ...changes, onboardingCompleted: true });
      // The root layout moves to Home once the profile updates.
    } catch {
      Alert.alert('Could not save', 'Check your connection and try again.');
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={authTheme.gradient} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.flex}>
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.iconWrap}>
              <Sparkles size={28} color={authTheme.linkHighlight} />
            </View>
            <Text style={styles.title}>Coach intake</Text>
            <Text style={styles.subtitle}>
              A few details help your AI coach stay relevant. Your age updates automatically from your date of birth.
            </Text>

            <DobInputs value={draft.dob} onChange={set('dob')} />

            <IntakeField
              label="Profession *"
              placeholder="Role / field"
              value={draft.profession}
              onChangeText={set('profession')}
              maxLength={PROFILE_LIMITS.profession}
            />
            <IntakeField
              label="Goals & focus *"
              placeholder="What are you working toward over the next months?"
              value={draft.goalsSummary}
              onChangeText={set('goalsSummary')}
              maxLength={PROFILE_LIMITS.goalsSummary}
              multiline
            />

            <Text style={intakeStyles.optionalHeader}>Optional</Text>

            <IntakeField
              label="Income (optional)"
              placeholder="Rough band or skip"
              value={draft.income}
              onChangeText={set('income')}
              maxLength={PROFILE_LIMITS.income}
            />
            <IntakeField
              label="Lifestyle (optional)"
              placeholder="Routines, priorities, living situation…"
              value={draft.lifestyle}
              onChangeText={set('lifestyle')}
              maxLength={PROFILE_LIMITS.lifestyle}
              multiline
            />
            <IntakeField
              label="Current struggles (optional)"
              placeholder="What’s getting in the way?"
              value={draft.struggles}
              onChangeText={set('struggles')}
              maxLength={PROFILE_LIMITS.struggles}
              multiline
            />
            <IntakeField
              label="Notes for your coach (optional)"
              placeholder="Anything else they should remember"
              value={draft.coachNotes}
              onChangeText={set('coachNotes')}
              maxLength={PROFILE_LIMITS.coachNotes}
              multiline
            />

            <TouchableOpacity
              style={[styles.button, submitting && styles.busy]}
              onPress={() => void handleComplete()}
              disabled={submitting}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Continue to BYT"
            >
              {submitting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Text style={styles.buttonText}>Continue to BYT</Text>
                  <ArrowRight size={20} color="#FFF" />
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 24, paddingBottom: 40, paddingTop: 16 },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: authTheme.iconBoxBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: authTheme.iconBoxBorder,
  },
  title: { fontSize: 28, fontWeight: '800', color: authTheme.title, marginBottom: 8 },
  subtitle: { fontSize: 15, color: authTheme.subtitle, lineHeight: 22, marginBottom: 28 },
  button: {
    marginTop: 8,
    backgroundColor: authTheme.button,
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  busy: { opacity: 0.75 },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
