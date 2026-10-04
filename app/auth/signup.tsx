import { getAuthTheme } from '@/constants/theme';
import { auth, isFirebaseConfigured } from '@/services/firebase';
import { useStore, withSuppressedProfileFlush } from '@/store/useStore';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { ArrowRight, Lock, Mail, Sparkles, User } from 'lucide-react-native';
import { useMemo, useState } from 'react';
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

export default function Signup() {
  const router = useRouter();
  const authTheme = getAuthTheme();
  const styles = useMemo(() => createStyles(authTheme), [authTheme]);

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login, setOnboardingCompleted } = useStore();

  const handleSignup = async () => {
    if (!email || !name || !password) {
      Alert.alert('Missing Fields', 'Please fill in all fields.');
      return;
    }

    setIsLoading(true);
    try {
      if (!auth || !isFirebaseConfigured) {
        Alert.alert(
          'Firebase not configured',
          'Add your EXPO_PUBLIC_FIREBASE_* keys to the project .env file, restart Expo, then try again.'
        );
        return;
      }
      const credentials = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(credentials.user, { displayName: name.trim() });
      withSuppressedProfileFlush(() => {
        login(name.trim(), credentials.user.email || email.trim(), credentials.user.uid);
      });
      setOnboardingCompleted(false);
      router.replace('/onboarding');
    } catch (error: any) {
      Alert.alert('Signup Failed', error.message || 'An error occurred during signup.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={authTheme.gradient} style={styles.background} />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
          style={styles.keyboardView}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={styles.content}>
              <View style={styles.header}>
                <View style={styles.iconContainer}>
                  <Sparkles size={32} color={authTheme.linkHighlight} />
                </View>
                <Text style={styles.title}>Join BYT</Text>
                <Text style={styles.subtitle}>Unlock your potential today.</Text>
              </View>

              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <View style={styles.inputIcon}>
                    <User size={20} color={authTheme.iconMuted} />
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="Full Name"
                    placeholderTextColor={authTheme.iconMuted}
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <View style={styles.inputIcon}>
                    <Mail size={20} color={authTheme.iconMuted} />
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="Email Address"
                    placeholderTextColor={authTheme.iconMuted}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <View style={styles.inputIcon}>
                    <Lock size={20} color={authTheme.iconMuted} />
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="Create Password"
                    placeholderTextColor={authTheme.iconMuted}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                  />
                </View>

                <TouchableOpacity
                  onPress={handleSignup}
                  style={[styles.button, isLoading && { opacity: 0.7 }]}
                  activeOpacity={0.8}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <>
                      <Text style={styles.buttonText}>Get Started</Text>
                      <ArrowRight size={20} color="#FFF" />
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity onPress={() => router.push('/auth/login')} style={styles.linkContainer}>
                  <Text style={styles.linkText}>
                    Already have an account? <Text style={styles.linkHighlight}>Log in</Text>
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function createStyles(authTheme: ReturnType<typeof getAuthTheme>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: authTheme.container,
    },
    background: {
      ...StyleSheet.absoluteFillObject,
    },
    safeArea: {
      flex: 1,
    },
    keyboardView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingVertical: 24,
    },
    content: {
      paddingHorizontal: 24,
    },
    header: {
      alignItems: 'center',
      marginBottom: 48,
    },
    iconContainer: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: authTheme.iconBoxBg,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 24,
      borderWidth: 1,
      borderColor: authTheme.iconBoxBorder,
    },
    title: {
      fontSize: 32,
      fontWeight: 'bold',
      color: authTheme.title,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 16,
      color: authTheme.subtitle,
      textAlign: 'center',
    },
    form: {
      gap: 16,
    },
    inputGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: authTheme.inputBg,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: authTheme.inputBorder,
      height: 56,
    },
    inputIcon: {
      paddingHorizontal: 16,
    },
    input: {
      flex: 1,
      color: authTheme.inputText,
      fontSize: 16,
      height: '100%',
      paddingRight: 16,
    },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: authTheme.button,
      height: 56,
      borderRadius: 16,
      marginTop: 24,
      gap: 8,
      shadowColor: authTheme.buttonShadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 6,
    },
    buttonText: {
      color: '#FFF',
      fontSize: 18,
      fontWeight: 'bold',
    },
    linkContainer: {
      marginTop: 24,
      alignItems: 'center',
    },
    linkText: {
      color: authTheme.link,
      fontSize: 14,
    },
    linkHighlight: {
      color: authTheme.linkHighlight,
      fontWeight: '600',
    },
  });
}
