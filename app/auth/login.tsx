import { router } from 'expo-router';
import { Lock, Mail } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity } from 'react-native';

import { friendlyError, validateEmail } from '@/features/auth/authErrors';
import { logIn, requestPasswordReset } from '@/services/authService';
import { AuthButton, AuthField, AuthLayout, AuthLink, authStyles } from '@/ui/auth';

const RESET_SENT = 'If an account exists for that email, a reset link is on its way.';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing Fields', 'Please fill in all fields.');
      return;
    }
    setIsLoading(true);
    try {
      await logIn(email, password);
      // The root layout moves on once the account has loaded.
    } catch (e) {
      Alert.alert('Login Failed', friendlyError(e));
      setIsLoading(false);
    }
  };

  const handleForgot = async () => {
    const emailError = validateEmail(email);
    if (emailError) {
      Alert.alert('Reset password', 'Enter your email address above first.');
      return;
    }
    try {
      await requestPasswordReset(email);
      Alert.alert('Reset password', RESET_SENT);
    } catch (e) {
      const message = friendlyError(e);
      // Don't reveal whether an account exists.
      Alert.alert('Reset password', message === friendlyError({ code: 'auth/user-not-found' }) ? RESET_SENT : message);
    }
  };

  return (
    <AuthLayout title="Welcome Back" subtitle="Sign in to continue building your tomorrow.">
      <AuthField
        icon={Mail}
        placeholder="Email Address"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <AuthField
        ref={passwordRef}
        icon={Lock}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={() => void handleLogin()}
      />
      <TouchableOpacity onPress={() => void handleForgot()} style={authStyles.smallLink} accessibilityRole="button">
        <Text style={authStyles.smallLinkText}>Forgot password?</Text>
      </TouchableOpacity>

      <AuthButton label="Log In" onPress={() => void handleLogin()} loading={isLoading} />

      <AuthLink prompt="Don't have an account?" action="Sign up" onPress={() => router.replace('/auth/signup')} />

      <Text style={authStyles.hint}>Logged out from another account? Use your email above to sign in here.</Text>
    </AuthLayout>
  );
}
