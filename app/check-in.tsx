import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { friendlyError } from '@/features/auth/authErrors';
import {
  CHECK_IN_NOTE_LIMIT,
  computeStreaks,
  EMPTY_RATINGS,
  missingRatings,
  RATING_SCALES,
  type Ratings,
} from '@/features/checkIns/checkIns';
import { formatDayLabel, localDateKey } from '@/features/dates';
import { saveCheckIn } from '@/services/checkInsService';
import { retryUserData } from '@/services/session';
import { useAuthStore } from '@/stores/authStore';
import { useUserDataStore } from '@/stores/userDataStore';
import { AppText, Banner, Button, Card, RatingPicker, Screen, ScreenHeader, space, TextField, useDiscardGuard } from '@/ui';

export default function CheckInScreen() {
  const uid = useAuthStore((s) => s.user?.uid);
  const { status, items, error: loadError } = useUserDataStore((s) => s.checkIns);
  const [today] = useState(localDateKey);
  const existing = items.find((c) => c.id === today);

  const initial = useMemo(
    () => ({
      ratings: existing
        ? { mood: existing.mood, energy: existing.energy, stress: existing.stress, sleep: existing.sleep }
        : EMPTY_RATINGS,
      note: existing?.note ?? '',
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [existing?.id]
  );
  const [ratings, setRatings] = useState<Ratings>(initial.ratings);
  const [note, setNote] = useState(initial.note);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setRatings(initial.ratings);
    setNote(initial.note);
  }, [initial]);
  useEffect(() => {
    if (done) router.back();
  }, [done]);

  const dirty = JSON.stringify({ ratings, note }) !== JSON.stringify(initial);
  useDiscardGuard(dirty && !done);

  const streaks = computeStreaks(
    items.map((c) => c.id),
    today
  );
  const recent = items.filter((c) => c.id !== today).slice(0, 6);

  const onSave = async () => {
    if (!uid) return;
    const missing = missingRatings(ratings);
    if (missing.length > 0) {
      const names = RATING_SCALES.filter((s) => missing.includes(s.key)).map((s) => s.label.toLowerCase());
      return setError(`Add a rating for ${names.join(', ')}.`);
    }
    setError(null);
    setSaving(true);
    try {
      await saveCheckIn(
        uid,
        today,
        { mood: ratings.mood!, energy: ratings.energy!, stress: ratings.stress!, sleep: ratings.sleep!, note },
        !!existing
      );
      setDone(true);
    } catch (e) {
      setError(friendlyError(e, 'We couldn’t save your check-in. Please try again.'));
      setSaving(false);
    }
  };

  return (
    <Screen
      scroll
      footer={
        <Button
          label={existing ? 'Update check-in' : 'Save check-in'}
          onPress={onSave}
          loading={saving}
          disabled={status === 'loading' || (!!existing && !dirty)}
        />
      }
    >
      <ScreenHeader title="Daily check-in" />

      <View style={styles.intro}>
        <AppText variant="title">{existing ? 'Today’s check-in' : 'How’s today going?'}</AppText>
        <AppText tone="secondary">
          {streaks.current > 0
            ? `${streaks.current}-day streak${streaks.checkedInToday ? '' : ' — check in to keep it going'}.`
            : 'A quick honest snapshot. Takes under a minute.'}
        </AppText>
      </View>

      <View style={styles.form}>
        {status === 'unavailable' && loadError ? (
          <View style={styles.errorBox}>
            <Banner message={loadError} />
            <Button label="Try again" variant="secondary" onPress={retryUserData} />
          </View>
        ) : null}
        {error ? <Banner message={error} /> : null}

        {RATING_SCALES.map((scale) => (
          <RatingPicker
            key={scale.key}
            label={scale.label}
            question={scale.question}
            low={scale.low}
            high={scale.high}
            value={ratings[scale.key]}
            onChange={(v) => {
              setRatings((r) => ({ ...r, [scale.key]: v }));
              setError(null);
            }}
          />
        ))}

        <TextField
          label="Anything on your mind?"
          value={note}
          onChangeText={setNote}
          placeholder="A word or two is enough"
          maxLength={CHECK_IN_NOTE_LIMIT}
          multiline
          optional
        />
      </View>

      {recent.length > 0 ? (
        <View style={styles.recent}>
          <AppText variant="overline" tone="muted">
            Recent days{streaks.best > 1 ? ` · best streak ${streaks.best}` : ''}
          </AppText>
          {recent.map((c) => (
            <Card key={c.id} style={styles.recentCard}>
              <AppText variant="label">{formatDayLabel(c.id, today)}</AppText>
              <AppText variant="caption" tone="secondary">
                Mood {c.mood} · Energy {c.energy} · Stress {c.stress} · Sleep {c.sleep}
              </AppText>
            </Card>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { marginTop: space.xl, gap: space.sm },
  form: { marginTop: space.xxl, gap: space.xxl },
  errorBox: { gap: space.md },
  recent: { marginTop: space.xxxl, gap: space.sm },
  recentCard: { gap: space.xs },
});
