import { Alert, Platform } from 'react-native';

import { friendlyError } from '@/features/auth/authErrors';
import { logOut } from '@/services/authService';

async function run(force: boolean) {
  try {
    const result = await logOut({ force });
    if (result === 'unsynced') {
      Alert.alert(
        'Some changes haven’t synced',
        'You seem to be offline. If you log out now, recent changes on this device will be lost.',
        [
          { text: 'Stay logged in', style: 'cancel' },
          { text: 'Log out anyway', style: 'destructive', onPress: () => void run(true) },
        ]
      );
    }
  } catch (e) {
    Alert.alert('Logout Failed', friendlyError(e, 'Please try again.'));
  }
}

/** "Log out?" confirmation, then sign out after pending writes have reached the server. */
export function confirmLogout(message: string) {
  if (Platform.OS === 'web') return void run(false);
  Alert.alert('Log out?', message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Log out', style: 'destructive', onPress: () => void run(false) },
  ]);
}

export function showCoachComingSoon() {
  Alert.alert('Coming soon', 'Your AI coach arrives in the next build.');
}
