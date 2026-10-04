import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { friendlyError } from '@/features/auth/authErrors';
import { draftFromProfile, resolveDraft, type ProfileDraft } from '@/features/profile/draft';
import { diffProfileFields, EMPTY_PROFILE_FIELDS } from '@/features/profile/profileDoc';
import { hasErrors, PROFILE_LIMITS, type ProfileErrors } from '@/features/profile/validation';
import { saveProfileChanges } from '@/services/profileService';
import { useProfileStore } from '@/stores/profileStore';
import type { ProfileFields } from '@/types/models';
import { AppText, Banner, Button, colors, DobField, radius, Screen, space, TextField } from '@/ui';

type Step = {
  title: string;
  intro: string;
  keys: readonly (keyof ProfileFields)[];
};

const STEPS: readonly Step[] = [
  {
    title: 'Let’s start with you',
    intro: 'A few basics so your coach knows who they’re talking to.',
    keys: ['displayName', 'dateOfBirth', 'profession'],
  },
  {
    title: 'What do you want to build?',
    intro: 'Rough is fine. You’ll shape this with your coach over time.',
    keys: ['goalsSummary', 'struggles'],
  },
  {
    title: 'A little context',
    intro: 'All optional. Your coach keeps this in the background and only brings it up when it helps.',
    keys: ['lifestyle', 'income', 'coachNotes'],
  },
];

export default function Onboarding() {
  const profile = useProfileStore((s) => s.profile);
  const uid = useProfileStore((s) => s.uid);
  const [draft, setDraft] = useState<ProfileDraft>(() => draftFromProfile(profile ?? EMPTY_PROFILE_FIELDS));
  const [stepIndex, setStepIndex] = useState(0);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const step = STEPS[stepIndex]!;
  const isLast = stepIndex === STEPS.length - 1;
  const set = <K extends keyof ProfileDraft>(key: K) => (value: ProfileDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const onContinue = async () => {
    if (!uid || !profile) return;
    const { fields, errors: stepErrors } = resolveDraft(draft, step.keys);
    setErrors(stepErrors);
    if (hasErrors(stepErrors)) return;

    const changes = diffProfileFields(profile, { ...profile, ...fields });
    setSaving(true);
    setSaveError(null);
    try {
      // Each step is saved, so nothing is lost if the app closes mid-way.
      await saveProfileChanges(uid, isLast ? { ...changes, onboardingCompleted: true } : changes);
      if (!isLast) setStepIndex((i) => i + 1);
      // On the last step the root layout moves to Home once the profile updates.
    } catch (e) {
      setSaveError(friendlyError(e, 'We couldn’t save that. Check your connection and try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      scroll
      footer={
        <>
          <Button label={isLast ? 'Finish' : 'Continue'} onPress={onContinue} loading={saving} />
          {stepIndex > 0 ? (
            <Button label="Back" variant="ghost" onPress={() => setStepIndex((i) => i - 1)} disabled={saving} />
          ) : null}
        </>
      }
    >
      <View style={styles.progress} accessibilityLabel={`Step ${stepIndex + 1} of ${STEPS.length}`}>
        {STEPS.map((s, i) => (
          <View key={s.title} style={[styles.segment, i <= stepIndex && styles.segmentActive]} />
        ))}
      </View>

      <View style={styles.titles}>
        <AppText variant="overline" tone="muted">
          Step {stepIndex + 1} of {STEPS.length}
        </AppText>
        <AppText variant="title">{step.title}</AppText>
        <AppText tone="secondary">{step.intro}</AppText>
      </View>

      <View style={styles.form}>
        {saveError ? <Banner message={saveError} /> : null}

        {stepIndex === 0 ? (
          <>
            <TextField
              label="Your name"
              value={draft.displayName}
              onChangeText={set('displayName')}
              placeholder="What should your coach call you?"
              maxLength={PROFILE_LIMITS.displayName}
              autoComplete="given-name"
              error={errors.displayName}
            />
            <DobField value={draft.dob} onChange={set('dob')} error={errors.dateOfBirth} />
            <TextField
              label="What do you do?"
              value={draft.profession}
              onChangeText={set('profession')}
              placeholder="e.g. Student, designer, founder"
              maxLength={PROFILE_LIMITS.profession}
              error={errors.profession}
            />
          </>
        ) : null}

        {stepIndex === 1 ? (
          <>
            <TextField
              label="What are you working towards?"
              value={draft.goalsSummary}
              onChangeText={set('goalsSummary')}
              placeholder="e.g. Get into university, build a business, feel healthier"
              maxLength={PROFILE_LIMITS.goalsSummary}
              multiline
              error={errors.goalsSummary}
            />
            <TextField
              label="What tends to get in the way?"
              value={draft.struggles}
              onChangeText={set('struggles')}
              placeholder="e.g. Procrastination, self-doubt, not enough time"
              maxLength={PROFILE_LIMITS.struggles}
              multiline
              optional
              error={errors.struggles}
            />
          </>
        ) : null}

        {stepIndex === 2 ? (
          <>
            <TextField
              label="Your lifestyle"
              value={draft.lifestyle}
              onChangeText={set('lifestyle')}
              placeholder="Routine, commitments, how your days look"
              maxLength={PROFILE_LIMITS.lifestyle}
              multiline
              optional
              error={errors.lifestyle}
            />
            <TextField
              label="Income"
              value={draft.income}
              onChangeText={set('income')}
              placeholder="Only if it matters for your goals"
              maxLength={PROFILE_LIMITS.income}
              optional
              error={errors.income}
            />
            <TextField
              label="Anything else your coach should know?"
              value={draft.coachNotes}
              onChangeText={set('coachNotes')}
              placeholder="How you like to be challenged, things to avoid…"
              maxLength={PROFILE_LIMITS.coachNotes}
              multiline
              optional
              error={errors.coachNotes}
            />
          </>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  segment: { flex: 1, height: 3, borderRadius: radius.pill, backgroundColor: colors.border },
  segmentActive: { backgroundColor: colors.accent },
  titles: { marginTop: space.xxl, gap: space.sm },
  form: { marginTop: space.xxl, gap: space.xl },
});
