import { usePreventRemove } from '@react-navigation/native';
import { useNavigation } from 'expo-router';
import { Alert, Platform } from 'react-native';

/**
 * Asks before leaving a screen with unsaved edits (back button, gesture or
 * Android hardware back). Pass `enabled = false` once the edits are saved.
 */
export function useDiscardGuard(enabled: boolean) {
  const navigation = useNavigation();
  // Alert is a no-op on web, which would trap the user on the screen.
  usePreventRemove(enabled && Platform.OS !== 'web', ({ data }) => {
    Alert.alert('Discard changes?', 'Your edits haven’t been saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });
}
