import Slider from '@react-native-community/slider';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { friendlyError } from '@/features/auth/authErrors';
import { METRICS, MOODS, REFLECTION_LIMIT, toggleMood, WIN_LIMIT, type MetricKey } from '@/features/checkIns/checkIns';
import { localDateKey } from '@/features/dates';
import { saveCheckIn } from '@/services/checkInsService';
import { useAuthStore } from '@/stores/authStore';
import { useProfileStore } from '@/stores/profileStore';
import { useUserDataStore } from '@/stores/userDataStore';
import type { MoodId } from '@/types/models';
import { theme } from '@/ui';

const ACCENT = '#2563EB';

export default function CheckInScreen() {
  const uid = useAuthStore((s) => s.user?.uid);
  const firstName = useProfileStore((s) => s.profile?.displayName.split(' ')[0]) || 'Friend';
  const [today] = useState(localDateKey);
  const existing = useUserDataStore((s) => s.checkIns.items.find((c) => c.id === today));

  // Re-checking in on the same day edits today's check-in, so start from it.
  const [moods, setMoods] = useState<MoodId[]>(existing?.moods ?? ['energized']);
  const [metrics, setMetrics] = useState<Record<MetricKey, number>>(
    existing
      ? { happiness: existing.happiness, stress: existing.stress, sleep: existing.sleep }
      : { happiness: 7, stress: 3, sleep: 8 }
  );
  const [reflection, setReflection] = useState(existing?.reflection ?? '');
  const [win, setWin] = useState(existing?.win ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);
  const [adoptedId, setAdoptedId] = useState(existing?.id ?? null);
  // Today's check-in can arrive from the cloud after the screen opens; adopt it if nothing was changed yet.
  if (existing && adoptedId !== existing.id && !touched) {
    setAdoptedId(existing.id);
    setMoods(existing.moods);
    setMetrics({ happiness: existing.happiness, stress: existing.stress, sleep: existing.sleep });
    setReflection(existing.reflection ?? '');
    setWin(existing.win ?? '');
  }

  const handleSubmit = async () => {
    if (!uid) return;
    setSubmitting(true);
    try {
      await saveCheckIn(uid, today, { moods, ...metrics, reflection, win }, !!existing);
      router.back();
    } catch (e) {
      Alert.alert('Could not save', friendlyError(e, 'Check your connection and try again.'));
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back">
              <ChevronLeft size={24} color={theme.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Daily Check-In</Text>
            <View style={styles.headerSpacer} />
          </View>

          <Text style={styles.title}>How are you feeling, {firstName}?</Text>
          <Text style={styles.subtitle}>Take a moment to ground yourself.</Text>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Select your mood</Text>
            <View style={styles.moodGrid}>
              {MOODS.map((mood) => {
                const selected = moods.includes(mood.id);
                return (
                  <TouchableOpacity
                    key={mood.id}
                    style={[styles.moodChip, selected && styles.moodChipSelected]}
                    onPress={() => {
                      setTouched(true);
                      setMoods((m) => toggleMood(m, mood.id));
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={mood.label}
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.moodText, { color: selected ? '#FFF' : theme.text }]}>
                      {mood.icon} {mood.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Metrics</Text>
            {METRICS.map((metric) => (
              <View key={metric.key} style={styles.metricCard}>
                <View style={styles.metricHeader}>
                  <Text style={styles.metricName}>{metric.label}</Text>
                  <Text style={styles.metricValue}>{metrics[metric.key]}</Text>
                </View>
                <Slider
                  style={styles.slider}
                  minimumValue={1}
                  maximumValue={10}
                  step={1}
                  value={metrics[metric.key]}
                  onValueChange={(v) => {
                    setTouched(true);
                    setMetrics((m) => ({ ...m, [metric.key]: Math.round(v) }));
                  }}
                  minimumTrackTintColor={ACCENT}
                  maximumTrackTintColor={theme.border}
                  thumbTintColor={ACCENT}
                  accessibilityLabel={metric.label}
                />
                <View style={styles.metricLabels}>
                  <Text style={styles.metricEndLabel}>{metric.low}</Text>
                  <Text style={styles.metricEndLabel}>{metric.high}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Reflect</Text>
            <Text style={styles.inputLabel}>What&apos;s on your mind today?</Text>
            <TextInput
              style={styles.textArea}
              placeholder="Start typing..."
              placeholderTextColor="#94A3B8"
              accessibilityLabel="What's on your mind today?"
              multiline
              value={reflection}
              onChangeText={(t) => {
                setTouched(true);
                setReflection(t);
              }}
              maxLength={REFLECTION_LIMIT}
            />
            <Text style={styles.inputLabel}>What is one small win you&apos;re aiming for?</Text>
            <TextInput
              style={styles.textArea}
              placeholder="Focus on one achievable thing..."
              placeholderTextColor="#94A3B8"
              accessibilityLabel="What is one small win you're aiming for?"
              multiline
              value={win}
              onChangeText={(t) => {
                setTouched(true);
                setWin(t);
              }}
              maxLength={WIN_LIMIT}
            />
          </View>

          <TouchableOpacity
            style={[styles.submitButton, submitting && styles.busy]}
            onPress={() => void handleSubmit()}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel="Submit Check-In"
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Submit Check-In</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.skipButton} onPress={() => router.back()} accessibilityRole="button">
            <Text style={styles.skipButtonText}>Skip for now</Text>
          </TouchableOpacity>

          <View style={styles.bottomSpace} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.background },
  flex: { flex: 1 },
  contentContainer: { padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 },
  backButton: { padding: 8, marginLeft: -8 },
  headerTitle: { fontSize: 16, fontWeight: '600', color: theme.text },
  headerSpacer: { width: 40 },
  title: { fontSize: 28, fontWeight: '700', color: theme.text, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#64748B', textAlign: 'center', marginBottom: 32 },
  section: { marginBottom: 32 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 16,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  moodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  moodChip: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    borderWidth: 1,
    backgroundColor: theme.card,
    borderColor: theme.border,
  },
  moodChipSelected: { backgroundColor: ACCENT, borderColor: ACCENT },
  moodText: { fontSize: 15, fontWeight: '500' },
  metricCard: {
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  metricHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  metricName: { fontSize: 16, fontWeight: '500', color: theme.text },
  metricValue: { fontSize: 16, fontWeight: '700', color: ACCENT },
  slider: { width: '100%', height: 40 },
  metricLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  metricEndLabel: { fontSize: 11, color: '#94A3B8', fontWeight: '600' },
  inputLabel: { fontSize: 15, fontWeight: '500', color: theme.text, marginBottom: 12 },
  textArea: {
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 16,
    height: 120,
    fontSize: 15,
    color: theme.text,
    textAlignVertical: 'top',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: theme.border,
  },
  submitButton: {
    backgroundColor: ACCENT,
    paddingVertical: 18,
    borderRadius: 30,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  busy: { opacity: 0.75 },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  skipButton: { paddingVertical: 12, alignItems: 'center' },
  skipButtonText: { color: '#64748B', fontSize: 15, fontWeight: '500' },
  bottomSpace: { height: 40 },
});
