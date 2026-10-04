import {
  PRIVACY_EFFECTIVE_DATE,
  PRIVACY_LAST_UPDATED,
  PRIVACY_POLICY_URL,
  PRIVACY_SECTIONS,
} from '@/constants/privacyPolicy';
import { theme } from '@/constants/theme';
import { useRouter } from 'expo-router';
import { ChevronLeft, ExternalLink } from 'lucide-react-native';
import React, { useMemo } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  const styles = useMemo(() => createStyles(), []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={12}>
          <ChevronLeft size={24} color={theme.text} />
        </Pressable>
        <Text style={styles.topTitle}>Privacy</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.brand}>BYT</Text>
        <Text style={styles.title}>Privacy Policy</Text>
        <Text style={styles.lede}>A short notice about how BYT handles your information.</Text>
        <Text style={styles.meta}>
          Effective {PRIVACY_EFFECTIVE_DATE} · Last updated {PRIVACY_LAST_UPDATED}
        </Text>

        <View style={styles.callout}>
          <Text style={styles.calloutText}>
            We do not sell your personal data. We do not rent or trade it to advertisers.
          </Text>
        </View>

        <Pressable
          style={styles.webLink}
          onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
        >
          <Text style={styles.webLinkText}>Open hosted web version</Text>
          <ExternalLink size={16} color={theme.primary} />
        </Pressable>

        {PRIVACY_SECTIONS.filter((s) => s.id !== 'overview').map((section) => (
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

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles() {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: theme.background,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    back: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    topTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '700',
    },
    content: {
      paddingHorizontal: 24,
      paddingTop: 28,
    },
    brand: {
      color: theme.primary,
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: 2,
      marginBottom: 8,
    },
    title: {
      color: theme.text,
      fontSize: 32,
      fontWeight: '800',
      letterSpacing: -0.5,
      marginBottom: 10,
    },
    lede: {
      color: theme.textSecondary,
      fontSize: 16,
      lineHeight: 24,
      marginBottom: 12,
    },
    meta: {
      color: theme.textMuted,
      fontSize: 13,
      marginBottom: 16,
    },
    callout: {
      backgroundColor: theme.primarySoft,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: 'rgba(59,130,246,0.28)',
    },
    calloutText: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '600',
      lineHeight: 22,
    },
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
    webLinkText: {
      color: theme.primary,
      fontWeight: '700',
      fontSize: 14,
    },
    section: {
      marginBottom: 28,
    },
    sectionTitle: {
      color: theme.text,
      fontSize: 18,
      fontWeight: '700',
      marginBottom: 10,
    },
    paragraph: {
      color: theme.textSecondary,
      fontSize: 15,
      lineHeight: 23,
      marginBottom: 10,
    },
    bullet: {
      color: theme.textSecondary,
      fontSize: 15,
      lineHeight: 23,
      marginBottom: 8,
      paddingLeft: 4,
    },
    email: {
      color: theme.primary,
      fontSize: 15,
      fontWeight: '600',
      marginBottom: 20,
    },
    footnote: {
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 20,
    },
  });
}
