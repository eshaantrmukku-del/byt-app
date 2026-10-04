import * as Linking from 'expo-linking';
import { ExternalLink } from 'lucide-react-native';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  PRIVACY_EFFECTIVE_DATE,
  PRIVACY_LAST_UPDATED,
  PRIVACY_POLICY_URL,
  PRIVACY_SECTIONS,
} from '@/content/privacyPolicy';
import { theme } from '@/ui';
import { TopBar } from '@/ui/TopBar';

export default function PrivacyPolicyScreen() {
  const openWeb = () =>
    Linking.openURL(PRIVACY_POLICY_URL).catch(() => Alert.alert('Privacy Policy', `Visit ${PRIVACY_POLICY_URL}`));

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <TopBar title="Privacy" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.brand}>BYT</Text>
        <Text style={styles.title}>Privacy Policy</Text>
        <Text style={styles.lede}>A short notice about how BYT handles your information.</Text>
        <Text style={styles.meta}>
          Effective {PRIVACY_EFFECTIVE_DATE} · Last updated {PRIVACY_LAST_UPDATED}
        </Text>

        <View style={styles.callout}>
          <Text style={styles.calloutText}>We do not sell your personal data. We do not rent or trade it to advertisers.</Text>
        </View>

        <Pressable style={styles.webLink} onPress={() => void openWeb()} accessibilityRole="link">
          <Text style={styles.webLinkText}>Open hosted web version</Text>
          <ExternalLink size={16} color={theme.primary} />
        </Pressable>

        {PRIVACY_SECTIONS.map((section) => (
          <View key={section.id} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.paragraphs.map((p) => (
              <Text key={p.slice(0, 48)} style={styles.paragraph}>
                {p}
              </Text>
            ))}
            {section.bullets?.map((b) => (
              <Text key={b.slice(0, 48)} style={styles.bullet}>
                • {b}
              </Text>
            ))}
          </View>
        ))}

        <View style={styles.bottomSpace} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.background },
  content: { paddingHorizontal: 24, paddingTop: 28 },
  brand: { color: theme.primary, fontSize: 13, fontWeight: '800', letterSpacing: 2, marginBottom: 8 },
  title: { color: theme.text, fontSize: 32, fontWeight: '800', letterSpacing: -0.5, marginBottom: 10 },
  lede: { color: theme.textSecondary, fontSize: 16, lineHeight: 24, marginBottom: 12 },
  meta: { color: theme.textMuted, fontSize: 13, marginBottom: 16 },
  callout: {
    backgroundColor: theme.primarySoft,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.28)',
  },
  calloutText: { color: theme.text, fontSize: 15, fontWeight: '600', lineHeight: 22 },
  webLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: theme.primarySoft,
    marginBottom: 28,
  },
  webLinkText: { color: theme.primary, fontWeight: '700', fontSize: 14 },
  section: { marginBottom: 28 },
  sectionTitle: { color: theme.text, fontSize: 18, fontWeight: '700', marginBottom: 10 },
  paragraph: { color: theme.textSecondary, fontSize: 15, lineHeight: 23, marginBottom: 10 },
  bullet: { color: theme.textSecondary, fontSize: 15, lineHeight: 23, marginBottom: 8, paddingLeft: 4 },
  bottomSpace: { height: 40 },
});
