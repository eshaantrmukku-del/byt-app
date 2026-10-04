import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { friendlyError, validateEmail } from '@/features/auth/authErrors';
import { logIn, requestPasswordReset } from '@/services/authService';
import { AppText, Banner, Button, Logo, Screen, space, TextField } from '@/ui';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'login' | 'reset' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const onLogin = async () => {
    setNotice(null);
    const emailError = validateEmail(email);
    if (emailError) return setError(emailError);
    if (!password) return setError('Enter your password.');
    setError(null);
    setBusy('login');
    try {
      await logIn(email, password);
      // The root layout moves on once the account has loaded.
    } catch (e) {
      setError(friendlyError(e));
      setBusy(null);
    }
  };

  const onForgot = async () => {
    setNotice(null);
    const emailError = validateEmail(email);
    if (emailError) return setError('Enter your email above, then tap “Forgot password?” again.');
    setError(null);
    setBusy('reset');
    try {
      await requestPasswordReset(email);
      setNotice('If an account exists for that email, a reset link is on its way.');
    } catch (e) {
      const message = friendlyError(e);
      // Don't reveal whether an account exists.
      if (message === friendlyError({ code: 'auth/user-not-found' })) {
        setNotice('If an account exists for that email, a reset link is on its way.');
      } else {
        setError(message);
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen
      scroll
      footer={
        <>
          <Button label="Log in" onPress={onLogin} loading={busy === 'login'} disabled={busy !== null} />
          <Button
            label="New to BYT? Create an account"
            variant="ghost"
            onPress={() => router.replace('/auth/signup')}
            disabled={busy !== null}
          />
        </>
      }
    >
      <View style={styles.header}>
        <Logo size={40} />
        <View style={styles.titles}>
          <AppText variant="title">Welcome back</AppText>
          <AppText tone="secondary">Pick up where you left off.</AppText>
        </View>
      </View>

      <View style={styles.form}>
        {error ? <Banner message={error} /> : null}
        {notice ? <Banner tone="info" message={notice} /> : null}
        <TextField
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
        />
        <TextField
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="Your password"
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={onLogin}
        />
        <Button
          label="Forgot password?"
          variant="ghost"
          onPress={onForgot}
          loading={busy === 'reset'}
          disabled={busy !== null}
          style={styles.forgot}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: space.xxxl, gap: space.xxl },
  titles: { gap: space.sm },
  form: { marginTop: space.xxl, gap: space.lg },
  forgot: { alignSelf: 'flex-start', paddingHorizontal: 0 },
});
