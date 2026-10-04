import { theme } from '@/constants/theme';
import { useStore } from '@/store/useStore';
import { toCoachProfile } from '@/utils/coachProfilePersist';
import { ageFromIsoDate, splitIsoDate, validateDobInput } from '@/utils/dateOfBirth';
import { auth } from '@/services/firebase';
import { flushUserFirestoreNow } from '@/services/userFirestoreCoordinator';
import { useKeyboardBottomInset } from '@/hooks/use-keyboard-bottom-inset';
import { updateProfile } from 'firebase/auth';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export default function EditProfileScreen() {
  const router = useRouter();
  const styles = useMemo(() => createStyles(), []);
  const insets = useSafeAreaInsets();
  const { bottomInset, isOpen: keyboardOpen } = useKeyboardBottomInset();
  const { user, coachProfile, setCoachProfile, updateUserName } = useStore();

  const initialDob = splitIsoDate(coachProfile?.dateOfBirth);
  const [name, setName] = useState(user?.name ?? '');
  const [dobDay, setDobDay] = useState(initialDob.day);
  const [dobMonth, setDobMonth] = useState(initialDob.month);
  const [dobYear, setDobYear] = useState(initialDob.year);
  const [profession, setProfession] = useState(coachProfile?.profession ?? '');
  const [goalsSummary, setGoalsSummary] = useState(coachProfile?.goalsSummary ?? '');
  const [income, setIncome] = useState(coachProfile?.income ?? '');
  const [lifestyleNotes, setLifestyleNotes] = useState(coachProfile?.lifestyleNotes ?? '');
  const [struggles, setStruggles] = useState(coachProfile?.struggles ?? '');
  const [coachNotes, setCoachNotes] = useState(coachProfile?.coachNotes ?? '');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const profileKey = JSON.stringify(coachProfile ?? null) + '|' + (user?.name ?? '');
  useEffect(() => {
    if (dirty) return;
    const dob = splitIsoDate(coachProfile?.dateOfBirth);
    setName(user?.name ?? '');
    setDobDay(dob.day);
    setDobMonth(dob.month);
    setDobYear(dob.year);
    setProfession(coachProfile?.profession ?? '');
    setGoalsSummary(coachProfile?.goalsSummary ?? '');
    setIncome(coachProfile?.income ?? '');
    setLifestyleNotes(coachProfile?.lifestyleNotes ?? '');
    setStruggles(coachProfile?.struggles ?? '');
    setCoachNotes(coachProfile?.coachNotes ?? '');
  }, [dirty, profileKey, coachProfile, user?.name]);

  const touch =
    (setter: (value: string) => void) =>
    (value: string) => {
      setDirty(true);
      setter(value);
    };

  const liveAge = useMemo(() => {
    const dob = validateDobInput(dobDay, dobMonth, dobYear);
    return dob.ok ? dob.age : null;
  }, [dobDay, dobMonth, dobYear]);

  const handleSave = async () => {
    const dob = validateDobInput(dobDay, dobMonth, dobYear);
    if (!dob.ok) {
      Alert.alert('Date of birth', dob.error);
      return;
    }
    if (!profession.trim() || !goalsSummary.trim()) {
      Alert.alert('Required fields', 'Profession and goals are required so your coach stays accurate.');
      return;
    }

    setSaving(true);
    setDirty(true);
    try {
      const trimmedName = name.trim();
      if (trimmedName && trimmedName !== user?.name) {
        updateUserName(trimmedName);
      }

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
      const saved = await flushUserFirestoreNow();
      if (!saved) {
        Alert.alert('Could not save', 'Check your connection and try again.');
        return;
      }
      if (trimmedName && auth?.currentUser && auth.currentUser.displayName !== trimmedName) {
        try {
          await updateProfile(auth.currentUser, { displayName: trimmedName });
        } catch (error) {
          console.warn('Saved profile, but the account display name did not update:', error);
        }
      }
      Alert.alert('Saved', `You're ${dob.age} today — your coach will use these details from now on.`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('Failed to save profile:', error);
      Alert.alert('Could not save', 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={12}>
          <ChevronLeft size={24} color={theme.text} />
        </Pressable>
        <Text style={styles.topTitle}>Personal info</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={{ flex: 1, paddingBottom: keyboardOpen ? bottomInset : 0 }}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: 40 + (keyboardOpen ? 24 : insets.bottom) }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.lede}>
            Update your details anytime. Age is calculated from your date of birth so it stays
            accurate as the years go by. Your AI coach uses all of this — plus your chat history —
            every time you talk.
          </Text>

          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={touch(setName)}
            placeholder="Your name"
            placeholderTextColor={theme.textMuted}
          />

          <Text style={styles.label}>Date of birth *</Text>
          <Text style={styles.hint}>Day / month / year</Text>
          <View style={styles.dobRow}>
            <TextInput
              style={[styles.input, styles.dobInput]}
              placeholder="DD"
              placeholderTextColor={theme.textMuted}
              value={dobDay}
              onChangeText={(t) => touch(setDobDay)(t.replace(/\D/g, '').slice(0, 2))}
              keyboardType="number-pad"
              maxLength={2}
            />
            <Text style={styles.dobSep}>/</Text>
            <TextInput
              style={[styles.input, styles.dobInput]}
              placeholder="MM"
              placeholderTextColor={theme.textMuted}
              value={dobMonth}
              onChangeText={(t) => touch(setDobMonth)(t.replace(/\D/g, '').slice(0, 2))}
              keyboardType="number-pad"
              maxLength={2}
            />
            <Text style={styles.dobSep}>/</Text>
            <TextInput
              style={[styles.input, styles.dobYear]}
              placeholder="YYYY"
              placeholderTextColor={theme.textMuted}
              value={dobYear}
              onChangeText={(t) => touch(setDobYear)(t.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              maxLength={4}
            />
          </View>
          {liveAge !== null ? (
            <Text style={styles.agePreview}>Current age: {liveAge}</Text>
          ) : coachProfile?.dateOfBirth && ageFromIsoDate(coachProfile.dateOfBirth) !== null ? (
            <Text style={styles.agePreview}>
              Current age: {ageFromIsoDate(coachProfile.dateOfBirth)}
            </Text>
          ) : null}

          <Text style={styles.label}>Profession *</Text>
          <TextInput
            style={styles.input}
            value={profession}
            onChangeText={touch(setProfession)}
            placeholder="Role / field"
            placeholderTextColor={theme.textMuted}
          />

          <Text style={styles.label}>Goals & focus *</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={goalsSummary}
            onChangeText={touch(setGoalsSummary)}
            placeholder="What are you working toward?"
            placeholderTextColor={theme.textMuted}
            multiline
          />

          <Text style={styles.optionalHeader}>OPTIONAL</Text>

          <Text style={styles.label}>Income</Text>
          <TextInput
            style={styles.input}
            value={income}
            onChangeText={touch(setIncome)}
            placeholder="Rough band or leave blank"
            placeholderTextColor={theme.textMuted}
          />

          <Text style={styles.label}>Lifestyle</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={lifestyleNotes}
            onChangeText={touch(setLifestyleNotes)}
            placeholder="Routines, priorities, context"
            placeholderTextColor={theme.textMuted}
            multiline
          />

          <Text style={styles.label}>Current struggles</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={struggles}
            onChangeText={touch(setStruggles)}
            placeholder="What’s getting in the way?"
            placeholderTextColor={theme.textMuted}
            multiline
          />

          <Text style={styles.label}>Notes for your coach</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={coachNotes}
            onChangeText={touch(setCoachNotes)}
            placeholder="Anything else the coach should remember"
            placeholderTextColor={theme.textMuted}
            multiline
          />

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.75 }]}
            onPress={() => void handleSave()}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveText}>Save changes</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function createStyles() {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.background },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    topTitle: { color: theme.text, fontSize: 16, fontWeight: '700' },
    content: { paddingHorizontal: 24, paddingTop: 20 },
    lede: { color: theme.textSecondary, fontSize: 15, lineHeight: 22, marginBottom: 22 },
    label: { fontSize: 13, fontWeight: '600', color: theme.text, marginBottom: 8, marginTop: 4 },
    hint: { fontSize: 12, color: theme.textSecondary, marginBottom: 8, marginTop: -4 },
    dobRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    dobInput: { flex: 1, textAlign: 'center', marginBottom: 0 },
    dobYear: { flex: 1.4, textAlign: 'center', marginBottom: 0 },
    dobSep: { color: theme.textSecondary, fontSize: 18, fontWeight: '600', marginHorizontal: 6 },
    agePreview: { color: theme.primary, fontSize: 13, fontWeight: '600', marginBottom: 14 },
    optionalHeader: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.textSecondary,
      letterSpacing: 1.1,
      marginTop: 18,
      marginBottom: 10,
    },
    input: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: Platform.OS === 'ios' ? 14 : 10,
      color: theme.text,
      fontSize: 16,
      marginBottom: 14,
    },
    multiline: { minHeight: 96, textAlignVertical: 'top' },
    saveBtn: {
      marginTop: 12,
      backgroundColor: theme.primary,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
    },
    saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
}
