import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Screen, space } from '@/ui';

export default function NotFound() {
  return (
    <Screen contentStyle={styles.center}>
      <View style={styles.body}>
        <AppText variant="title" center>
          This page doesn’t exist
        </AppText>
        <Button label="Go home" onPress={() => router.replace('/')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: 'center' },
  body: { gap: space.xl },
});
