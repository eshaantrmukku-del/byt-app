import { getAuthTheme } from '@/constants/theme';
import { useStore } from '@/store/useStore';
import { toCoachProfile } from '@/utils/coachProfilePersist';
import { validateDobInput } from '@/utils/dateOfBirth';
import { flushUserFirestoreNow } from '@/services/userFirestoreCoordinator';
import { useKeyboardBottomInset } from '@/hooks/use-keyboard-bottom-inset';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ArrowRight, Sparkles } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function OnboardingScreen() {
  const router = useRouter();
  const authTheme = getAuthTheme();
  const styles = useMemo(() => createStyles(authTheme), [authTheme]);
  const { setCoachProfile, setOnboardingCompleted } = useStore();
  const { bottomInset, isOpen: keyboardOpen } = useKeyboardBottomInset();

  const [dobDay, setDobDay] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobYear, setDobYear] = useState('');
  const [profession, setProfession] = useState('');
  const [goalsSummary, setGoalsSummary] = useState('');
  const [income, setIncome] = useState('');
  const [lifestyleNotes, setLifestyleNotes] = useState('');
  const [struggles, setStruggles] = useState('');
  const [coachNotes, setCoachNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleComplete = async () => {
    const dob = validateDobInput(dobDay, dobMonth, dobYear);
    if (!dob.ok) {
      Alert.alert('Date of birth', dob.error);
      return;
    }
    if (!profession.trim() || !goalsSummary.trim()) {
      Alert.alert(
        'Required fields',
        'Please add your profession and goals so your coach can personalize your experience.'
      );
      return;
    }
    setSubmitting(true);
    const profile = toCoachProfile({
      dateOfBirth: dob.iso,
      profession,
      goalsSummary,
      income,
      lifestyleNotes,
      struggles,
      coachNotes,
    });
    setCoachProfile(profile);
    setOnboardingCompleted(true);
    const saved = await flushUserFirestoreNow();
    setSubmitting(false);
    if (!saved) {
      Alert.alert('Could not save', 'Check your connection and try again.');
      return;
    }
    router.replace('/(tabs)');
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={authTheme.gradient} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe}>
        <View style={{ flex: 1, paddingBottom: keyboardOpen ? bottomInset : 0 }}>
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
              A few details help your AI coach stay relevant. Your age updates automatically from your
              date of birth.
            </Text>

            <Text style={styles.label}>Date of birth *</Text>
            <Text style={styles.hint}>Day / month / year</Text>
            <View style={styles.dobRow}>
              <TextInput
                style={[styles.input, styles.dobInput]}
                placeholder="DD"
                placeholderTextColor={authTheme.iconMuted}
                value={dobDay}
                onChangeText={(t) => setDobDay(t.replace(/\D/g, '').slice(0, 2))}
                keyboardType="number-pad"
                maxLength={2}
              />
              <Text style={styles.dobSep}>/</Text>
              <TextInput
                style={[styles.input, styles.dobInput]}
                placeholder="MM"
                placeholderTextColor={authTheme.iconMuted}
                value={dobMonth}
                onChangeText={(t) => setDobMonth(t.replace(/\D/g, '').slice(0, 2))}
                keyboardType="number-pad"
                maxLength={2}
              />
              <Text style={styles.dobSep}>/</Text>
              <TextInput
                style={[styles.input, styles.dobYear]}
                placeholder="YYYY"
                placeholderTextColor={authTheme.iconMuted}
                value={dobYear}
                onChangeText={(t) => setDobYear(t.replace(/\D/g, '').slice(0, 4))}
                keyboardType="number-pad"
                maxLength={4}
              />
            </View>

            <Text style={styles.label}>Profession *</Text>
            <TextInput
              style={styles.input}
              placeholder="Role / field"
              placeholderTextColor={authTheme.iconMuted}
              value={profession}
              onChangeText={setProfession}
            />

            <Text style={styles.label}>Goals & focus *</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="What are you working toward over the next months?"
              placeholderTextColor={authTheme.iconMuted}
              value={goalsSummary}
              onChangeText={setGoalsSummary}
              multiline
            />

            <Text style={styles.optionalHeader}>Optional</Text>

            <Text style={styles.label}>Income (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Rough band or skip"
              placeholderTextColor={authTheme.iconMuted}
              value={income}
              onChangeText={setIncome}
            />

            <Text style={styles.label}>Lifestyle (optional)</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="Routines, priorities, living situation…"
              placeholderTextColor={authTheme.iconMuted}
              value={lifestyleNotes}
              onChangeText={setLifestyleNotes}
              multiline
            />

            <Text style={styles.label}>Current struggles (optional)</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="What’s getting in the way?"
              placeholderTextColor={authTheme.iconMuted}
              value={struggles}
              onChangeText={setStruggles}
              multiline
            />

            <Text style={styles.label}>Notes for your coach (optional)</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="Anything else they should remember"
              placeholderTextColor={authTheme.iconMuted}
              value={coachNotes}
              onChangeText={setCoachNotes}
              multiline
            />

            <TouchableOpacity
              style={[styles.button, submitting && { opacity: 0.75 }]}
              onPress={() => void handleComplete()}
              disabled={submitting}
              activeOpacity={0.85}
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
        </View>
      </SafeAreaView>
    </View>
  );
}

function createStyles(authTheme: ReturnType<typeof getAuthTheme>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: authTheme.container },
    safe: { flex: 1 },
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
    label: { fontSize: 13, fontWeight: '600', color: authTheme.title, marginBottom: 8, marginTop: 4 },
    hint: { fontSize: 12, color: authTheme.subtitle, marginBottom: 8, marginTop: -4 },
    dobRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
    dobInput: { flex: 1, textAlign: 'center', marginBottom: 0 },
    dobYear: { flex: 1.4, textAlign: 'center', marginBottom: 0 },
    dobSep: { color: authTheme.subtitle, fontSize: 18, fontWeight: '600', marginHorizontal: 6 },
    optionalHeader: {
      fontSize: 12,
      fontWeight: '700',
      color: authTheme.subtitle,
      letterSpacing: 1.2,
      marginTop: 12,
      marginBottom: 8,
      textTransform: 'uppercase',
    },
    input: {
      backgroundColor: authTheme.inputBg,
      borderWidth: 1,
      borderColor: authTheme.inputBorder,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: Platform.OS === 'ios' ? 14 : 10,
      color: authTheme.title,
      fontSize: 16,
      marginBottom: 14,
    },
    multiline: { minHeight: 96, textAlignVertical: 'top' },
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
    buttonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  });
}
