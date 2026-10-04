import { router } from 'expo-router';
import { Lock, Mail, User } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Alert, TextInput } from 'react-native';

import { friendlyError, validateEmail, validateNewPassword } from '@/features/auth/authErrors';
import { PROFILE_LIMITS } from '@/features/profile/validation';
import { signUp } from '@/services/authService';
import { AuthButton, AuthField, AuthLayout, AuthLink } from '@/ui/auth';

export default function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const handleSignup = async () => {
    if (!email.trim() || !name.trim() || !password) {
      Alert.alert('Missing Fields', 'Please fill in all fields.');
      return;
    }
    const problem = validateEmail(email) ?? validateNewPassword(password);
    if (problem) {
      Alert.alert('Signup Failed', problem);
      return;
    }
    setIsLoading(true);
    try {
      await signUp(name, email, password);
      // The root layout takes the new account into onboarding.
    } catch (e) {
      Alert.alert('Signup Failed', friendlyError(e));
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout title="Join BYT" subtitle="Start building your tomorrow today.">
      <AuthField
        icon={User}
        placeholder="Full Name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        autoComplete="name"
        maxLength={PROFILE_LIMITS.displayName}
        returnKeyType="next"
        onSubmitEditing={() => emailRef.current?.focus()}
      />
      <AuthField
        ref={emailRef}
        icon={Mail}
        placeholder="Email Address"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <AuthField
        ref={passwordRef}
        icon={Lock}
        placeholder="Create Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={() => void handleSignup()}
      />

      <AuthButton label="Get Started" onPress={() => void handleSignup()} loading={isLoading} />

      <AuthLink prompt="Already have an account?" action="Log in" onPress={() => router.replace('/auth/login')} />
    </AuthLayout>
  );
}
