import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ageFromIsoDate } from '@/features/profile/dob';
import { draftFromProfile, resolveDraft, type ProfileDraft } from '@/features/profile/draft';
import { diffProfileFields, EMPTY_PROFILE_FIELDS, PROFILE_FIELD_KEYS } from '@/features/profile/profileDoc';
import { PROFILE_LIMITS } from '@/features/profile/validation';
import { saveProfileChanges } from '@/services/profileService';
import { useProfileStore } from '@/stores/profileStore';
import { theme, useDiscardGuard } from '@/ui';
import { DobInputs, IntakeField, intakeStyles } from '@/ui/intake';
import { TopBar } from '@/ui/TopBar';

export default function EditProfileScreen() {
  const profile = useProfileStore((s) => s.profile);
  const uid = useProfileStore((s) => s.uid);
  const [initial] = useState<ProfileDraft>(() => draftFromProfile(profile ?? EMPTY_PROFILE_FIELDS));
  const [draft, setDraft] = useState<ProfileDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  useDiscardGuard(dirty && !done);
  useEffect(() => {
    if (done) router.back();
  }, [done]);

  const set = <K extends keyof ProfileDraft>(key: K) => (value: ProfileDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const liveAge = useMemo(() => {
    const dob = resolveDraft(draft, ['dateOfBirth']);
    return dob.fields.dateOfBirth ? ageFromIsoDate(dob.fields.dateOfBirth) : null;
  }, [draft]);

  const handleSave = async () => {
    if (!uid || !profile) return;
    const dob = resolveDraft(draft, ['dateOfBirth']);
    if (dob.errors.dateOfBirth) {
      Alert.alert('Date of birth', dob.errors.dateOfBirth);
      return;
    }
    if (!draft.profession.trim() || !draft.goalsSummary.trim()) {
      Alert.alert('Required fields', 'Profession and goals are required so your coach stays accurate.');
      return;
    }
    const keys = draft.displayName.trim() ? PROFILE_FIELD_KEYS : PROFILE_FIELD_KEYS.filter((k) => k !== 'displayName');
    const { fields, errors } = resolveDraft(draft, keys);
    const firstError = Object.values(errors)[0];
    if (firstError) {
      Alert.alert('Check your details', firstError);
      return;
    }

    setSaving(true);
    try {
      const outcome = await saveProfileChanges(uid, diffProfileFields(profile, { ...profile, ...fields }));
      const age = fields.dateOfBirth ? ageFromIsoDate(fields.dateOfBirth) : null;
      const message =
        outcome === 'pending'
          ? 'Saved on this device. It will sync when you’re back online.'
          : `You're ${age} today — your coach will use these details from now on.`;
      if (Platform.OS === 'web') setDone(true);
      else Alert.alert('Saved', message, [{ text: 'OK', onPress: () => setDone(true) }]);
    } catch {
      Alert.alert('Could not save', 'Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <TopBar title="Personal info" />

      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.lede}>
            Update your details anytime. Age is calculated from your date of birth so it stays accurate as the years go
            by. Your AI coach uses all of this — plus your chat history — every time you talk.
          </Text>

          <IntakeField
            label="Name"
            placeholder="Your name"
            value={draft.displayName}
            onChangeText={set('displayName')}
            maxLength={PROFILE_LIMITS.displayName}
          />

          <DobInputs value={draft.dob} onChange={set('dob')} />
          {liveAge !== null ? <Text style={styles.agePreview}>Current age: {liveAge}</Text> : null}

          <IntakeField
            label="Profession *"
            placeholder="Role / field"
            value={draft.profession}
            onChangeText={set('profession')}
            maxLength={PROFILE_LIMITS.profession}
          />
          <IntakeField
            label="Goals & focus *"
            placeholder="What are you working toward?"
            value={draft.goalsSummary}
            onChangeText={set('goalsSummary')}
            maxLength={PROFILE_LIMITS.goalsSummary}
            multiline
          />

          <Text style={[intakeStyles.optionalHeader, styles.optional]}>Optional</Text>

          <IntakeField
            label="Income"
            placeholder="Rough band or leave blank"
            value={draft.income}
            onChangeText={set('income')}
            maxLength={PROFILE_LIMITS.income}
          />
          <IntakeField
            label="Lifestyle"
            placeholder="Routines, priorities, context"
            value={draft.lifestyle}
            onChangeText={set('lifestyle')}
            maxLength={PROFILE_LIMITS.lifestyle}
            multiline
          />
          <IntakeField
            label="Current struggles"
            placeholder="What’s getting in the way?"
            value={draft.struggles}
            onChangeText={set('struggles')}
            maxLength={PROFILE_LIMITS.struggles}
            multiline
          />
          <IntakeField
            label="Notes for your coach"
            placeholder="Anything else the coach should remember"
            value={draft.coachNotes}
            onChangeText={set('coachNotes')}
            maxLength={PROFILE_LIMITS.coachNotes}
            multiline
          />

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.busy]}
            onPress={() => void handleSave()}
            disabled={saving}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Save changes"
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save changes</Text>}
          </TouchableOpacity>
          <View style={styles.bottomSpace} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.background },
  flex: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 20 },
  lede: { color: theme.textSecondary, fontSize: 15, lineHeight: 22, marginBottom: 22 },
  agePreview: { color: theme.primary, fontSize: 13, fontWeight: '600', marginTop: -8, marginBottom: 14 },
  optional: { marginTop: 18, marginBottom: 10 },
  saveBtn: { marginTop: 12, backgroundColor: theme.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  busy: { opacity: 0.75 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  bottomSpace: { height: 40 },
});
