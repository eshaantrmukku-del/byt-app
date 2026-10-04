import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { friendlyError } from '@/features/auth/authErrors';
import { draftFromProfile, resolveDraft, type ProfileDraft } from '@/features/profile/draft';
import { diffProfileFields, EMPTY_PROFILE_FIELDS, PROFILE_FIELD_KEYS } from '@/features/profile/profileDoc';
import { hasErrors, PROFILE_LIMITS, type ProfileErrors } from '@/features/profile/validation';
import { saveProfileChanges } from '@/services/profileService';
import { useProfileStore } from '@/stores/profileStore';
import { AppText, Banner, Button, DobField, Screen, ScreenHeader, space, TextField, useDiscardGuard } from '@/ui';

export default function EditProfile() {
  const profile = useProfileStore((s) => s.profile);
  const uid = useProfileStore((s) => s.uid);
  const [initial] = useState<ProfileDraft>(() => draftFromProfile(profile ?? EMPTY_PROFILE_FIELDS));
  const [draft, setDraft] = useState<ProfileDraft>(initial);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  useDiscardGuard(dirty && !done);
  useEffect(() => {
    if (done) router.back();
  }, [done]);
  const set = <K extends keyof ProfileDraft>(key: K) => (value: ProfileDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const onSave = async () => {
    if (!uid || !profile) return;
    const { fields, errors: nextErrors } = resolveDraft(draft, PROFILE_FIELD_KEYS);
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) return;

    const changes = diffProfileFields(profile, { ...profile, ...fields });
    setSaving(true);
    setSaveError(null);
    try {
      const outcome = await saveProfileChanges(uid, changes);
      if (outcome === 'pending') {
        Alert.alert('Saved on this device', 'Your changes will sync when you’re back online.');
      }
      setDone(true);
    } catch (e) {
      setSaveError(friendlyError(e, 'We couldn’t save your changes. Please try again.'));
      setSaving(false);
    }
  };

  return (
    <Screen scroll footer={<Button label="Save changes" onPress={onSave} loading={saving} disabled={!dirty} />}>
      <ScreenHeader title="Edit profile" />

      <AppText tone="secondary" style={styles.intro}>
        Your coach uses this as quiet background context.
      </AppText>

      <View style={styles.form}>
        {saveError ? <Banner message={saveError} /> : null}
        <TextField
          label="Name"
          value={draft.displayName}
          onChangeText={set('displayName')}
          maxLength={PROFILE_LIMITS.displayName}
          error={errors.displayName}
        />
        <DobField value={draft.dob} onChange={set('dob')} error={errors.dateOfBirth} />
        <TextField
          label="What you do"
          value={draft.profession}
          onChangeText={set('profession')}
          maxLength={PROFILE_LIMITS.profession}
          error={errors.profession}
        />
        <TextField
          label="What you’re working towards"
          value={draft.goalsSummary}
          onChangeText={set('goalsSummary')}
          maxLength={PROFILE_LIMITS.goalsSummary}
          multiline
          error={errors.goalsSummary}
        />
        <TextField
          label="What tends to get in the way"
          value={draft.struggles}
          onChangeText={set('struggles')}
          maxLength={PROFILE_LIMITS.struggles}
          multiline
          optional
          error={errors.struggles}
        />
        <TextField
          label="Lifestyle"
          value={draft.lifestyle}
          onChangeText={set('lifestyle')}
          maxLength={PROFILE_LIMITS.lifestyle}
          multiline
          optional
          error={errors.lifestyle}
        />
        <TextField
          label="Income"
          value={draft.income}
          onChangeText={set('income')}
          maxLength={PROFILE_LIMITS.income}
          optional
          error={errors.income}
        />
        <TextField
          label="Notes for your coach"
          value={draft.coachNotes}
          onChangeText={set('coachNotes')}
          maxLength={PROFILE_LIMITS.coachNotes}
          multiline
          optional
          error={errors.coachNotes}
        />
        {profile?.email ? (
          <AppText variant="caption" tone="muted">
            Signed in as {profile.email}
          </AppText>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { marginTop: space.lg },
  form: { marginTop: space.xl, gap: space.xl },
});
