import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { friendlyError, MIN_PASSWORD_LENGTH, validateEmail, validateNewPassword } from '@/features/auth/authErrors';
import { PROFILE_LIMITS } from '@/features/profile/validation';
import { signUp } from '@/services/authService';
import { AppText, Banner, Button, Logo, Screen, space, TextField } from '@/ui';

type Errors = { name?: string; email?: string; password?: string };

export default function SignUp() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const onSubmit = async () => {
    const next: Errors = {};
    if (!name.trim()) next.name = 'Tell us what to call you.';
    next.email = validateEmail(email) ?? undefined;
    next.password = validateNewPassword(password) ?? undefined;
    const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v)) as Errors;
    setErrors(clean);
    setFormError(null);
    if (Object.keys(clean).length > 0) return;

    setBusy(true);
    try {
      await signUp(name, email, password);
      // The root layout takes the new account into onboarding.
    } catch (e) {
      setFormError(friendlyError(e));
      setBusy(false);
    }
  };

  return (
    <Screen
      scroll
      footer={
        <>
          <Button label="Create account" onPress={onSubmit} loading={busy} />
          <Button
            label="Already have an account? Log in"
            variant="ghost"
            onPress={() => router.replace('/auth/login')}
            disabled={busy}
          />
        </>
      }
    >
      <View style={styles.header}>
        <Logo size={40} />
        <View style={styles.titles}>
          <AppText variant="title">Start building your tomorrow</AppText>
          <AppText tone="secondary">A private space to think clearly and follow through.</AppText>
        </View>
      </View>

      <View style={styles.form}>
        {formError ? <Banner message={formError} /> : null}
        <TextField
          label="What should we call you?"
          value={name}
          onChangeText={setName}
          placeholder="First name"
          autoComplete="given-name"
          textContentType="givenName"
          maxLength={PROFILE_LIMITS.displayName}
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
          error={errors.name}
        />
        <TextField
          ref={emailRef}
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          error={errors.email}
        />
        <TextField
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={onSubmit}
          error={errors.password}
        />
        <AppText variant="caption" tone="muted">
          Your conversations and profile are private to your account.
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: space.xxxl, gap: space.xxl },
  titles: { gap: space.sm },
  form: { marginTop: space.xxl, gap: space.lg },
});
