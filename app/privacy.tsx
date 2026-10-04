import * as Linking from 'expo-linking';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  ACCOUNT_DELETION_MAILTO,
  PRIVACY_CONTACT_EMAIL,
  PRIVACY_LAST_UPDATED,
  PRIVACY_POLICY_URL,
  PRIVACY_SECTIONS,
} from '@/content/privacyPolicy';
import { AppText, Banner, Button, Screen, ScreenHeader, space } from '@/ui';

export default function Privacy() {
  const [notice, setNotice] = useState<string | null>(null);

  const open = async (url: string, fallback: string) => {
    setNotice(null);
    try {
      await Linking.openURL(url);
    } catch {
      setNotice(fallback);
    }
  };

  return (
    <Screen scroll>
      <ScreenHeader title="Privacy" />
      <AppText variant="caption" tone="muted" style={styles.updated}>
        Last updated {PRIVACY_LAST_UPDATED}
      </AppText>

      <View style={styles.sections}>
        {PRIVACY_SECTIONS.map((section) => (
          <View key={section.id} style={styles.section}>
            <AppText variant="heading">{section.title}</AppText>
            {section.paragraphs.map((p) => (
              <AppText key={p} tone="secondary">
                {p}
              </AppText>
            ))}
            {section.bullets?.map((b) => (
              <View key={b} style={styles.bullet}>
                <AppText tone="secondary">•</AppText>
                <AppText tone="secondary" style={styles.bulletText}>
                  {b}
                </AppText>
              </View>
            ))}
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        {notice ? <Banner tone="info" message={notice} /> : null}
        <Button
          label="Request account deletion"
          variant="secondary"
          onPress={() => open(ACCOUNT_DELETION_MAILTO, `No email app found. Write to ${PRIVACY_CONTACT_EMAIL}.`)}
        />
        <Button
          label="Read the full policy online"
          variant="ghost"
          onPress={() => open(PRIVACY_POLICY_URL, `Couldn’t open the browser. Visit ${PRIVACY_POLICY_URL}`)}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  updated: { marginTop: space.sm, textAlign: 'center' },
  sections: { marginTop: space.xl, gap: space.xl },
  section: { gap: space.sm },
  bullet: { flexDirection: 'row', gap: space.sm },
  bulletText: { flex: 1 },
  actions: { marginTop: space.xxl, gap: space.sm },
});
