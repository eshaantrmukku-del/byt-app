import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight, Sparkles, type LucideIcon } from 'lucide-react-native';
import { forwardRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authTheme, shadows, theme } from './theme';

/** Gradient background, centred scrollable column and the Sparkles header used on auth screens. */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <View style={styles.container}>
      <LinearGradient colors={authTheme.gradient} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.flex}>
        <KeyboardAvoidingView behavior="padding" style={styles.flex} keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
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
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.subtitle}>{subtitle}</Text>
              </View>
              <View style={styles.form}>{children}</View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

type FieldProps = TextInputProps & { icon: LucideIcon; placeholder: string };

/** Rounded input with a leading icon; the placeholder doubles as its accessibility label. */
export const AuthField = forwardRef<TextInput, FieldProps>(function AuthField({ icon: Icon, placeholder, ...rest }, ref) {
  return (
    <View style={styles.inputGroup}>
      <View style={styles.inputIcon}>
        <Icon size={20} color={authTheme.iconMuted} />
      </View>
      <TextInput
        ref={ref}
        style={styles.input}
        placeholder={placeholder}
        accessibilityLabel={placeholder}
        placeholderTextColor={authTheme.iconMuted}
        selectionColor={theme.primary}
        {...rest}
      />
    </View>
  );
});

export function AuthButton({ label, onPress, loading }: { label: string; onPress: () => void; loading?: boolean }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.button, loading && styles.buttonBusy]}
      activeOpacity={0.8}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {loading ? (
        <ActivityIndicator color="#FFF" />
      ) : (
        <>
          <Text style={styles.buttonText}>{label}</Text>
          <ArrowRight size={20} color="#FFF" />
        </>
      )}
    </TouchableOpacity>
  );
}

export function AuthLink({ prompt, action, onPress }: { prompt: string; action: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.linkContainer} accessibilityRole="link" accessibilityLabel={`${prompt} ${action}`}>
      <Text style={styles.linkText}>
        {prompt} <Text style={styles.linkHighlight}>{action}</Text>
      </Text>
    </TouchableOpacity>
  );
}

export const authStyles = StyleSheet.create({
  hint: { marginTop: 28, textAlign: 'center', color: authTheme.subtitle, fontSize: 13, paddingHorizontal: 8, lineHeight: 18 },
  smallLink: { alignSelf: 'flex-end', paddingVertical: 4 },
  smallLinkText: { color: authTheme.linkHighlight, fontSize: 14, fontWeight: '600' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 24 },
  content: { paddingHorizontal: 24 },
  header: { alignItems: 'center', marginBottom: 48 },
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
  title: { fontSize: 32, fontWeight: 'bold', color: authTheme.title, marginBottom: 8 },
  subtitle: { fontSize: 16, color: authTheme.subtitle, textAlign: 'center' },
  form: { gap: 16 },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: authTheme.inputBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: authTheme.inputBorder,
    height: 56,
  },
  inputIcon: { paddingHorizontal: 16 },
  input: { flex: 1, minWidth: 0, color: '#FFFFFF', fontSize: 16, height: '100%', paddingRight: 16 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: authTheme.button,
    height: 56,
    borderRadius: 16,
    marginTop: 24,
    gap: 8,
    ...shadows.button,
  },
  buttonBusy: { opacity: 0.7 },
  buttonText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  linkContainer: { marginTop: 24, alignItems: 'center' },
  linkText: { color: authTheme.link, fontSize: 14 },
  linkHighlight: { color: authTheme.linkHighlight, fontWeight: '600' },
});
