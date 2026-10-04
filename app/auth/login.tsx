import { getAuthTheme } from '@/constants/theme';
import { auth, isFirebaseConfigured } from '@/services/firebase';
import { useStore, withSuppressedProfileFlush } from '@/store/useStore';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { ArrowRight, Lock, Mail, Sparkles } from 'lucide-react-native';
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

export default function Login() {
  const router = useRouter();
  const authTheme = getAuthTheme();
  const styles = useMemo(() => createStyles(authTheme), [authTheme]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useStore();

  const handleLogin = async () => {
    if (!email || !password) {
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
      const credentials = await signInWithEmailAndPassword(auth, email.trim(), password);
      const firebaseUser = credentials.user;
      const name = firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User';
      withSuppressedProfileFlush(() => {
        login(name, firebaseUser.email || email.trim(), firebaseUser.uid);
      });
      router.replace('/');
    } catch (error: any) {
      Alert.alert('Login Failed', error.message || 'An error occurred.');
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
                <Text style={styles.title}>Welcome Back</Text>
                <Text style={styles.subtitle}>Sign in to continue your ascent.</Text>
              </View>

              <View style={styles.form}>
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
                    placeholder="Password"
                    placeholderTextColor={authTheme.iconMuted}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                  />
                </View>

                <TouchableOpacity
                  onPress={handleLogin}
                  style={[styles.button, isLoading && { opacity: 0.7 }]}
                  activeOpacity={0.8}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <>
                      <Text style={styles.buttonText}>Log In</Text>
                      <ArrowRight size={20} color="#FFF" />
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity onPress={() => router.push('/auth/signup')} style={styles.linkContainer}>
                  <Text style={styles.linkText}>
                    Don&apos;t have an account? <Text style={styles.linkHighlight}>Sign up</Text>
                  </Text>
                </TouchableOpacity>

                <Text style={styles.switchAccountHint}>
                  Logged out from another account? Use your email above to sign in here.
                </Text>
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
    switchAccountHint: {
      marginTop: 28,
      textAlign: 'center',
      color: authTheme.subtitle,
      fontSize: 13,
      paddingHorizontal: 8,
      lineHeight: 18,
    },
  });
}
