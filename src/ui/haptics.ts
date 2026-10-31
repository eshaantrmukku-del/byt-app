import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Small, sparing haptics for moments that matter (sending, choosing, finishing), never
 * on every tap. A device without haptics just ignores them.
 */
export const haptic = {
  /** A light tick: a choice made. */
  select: () => fire(() => Haptics.selectionAsync()),
  /** A soft bump: something sent or started. */
  tap: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Something finished well (a goal completed, a check-in saved). */
  success: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
};

function fire(run: () => Promise<void>) {
  if (Platform.OS === 'web') return;
  void run().catch(() => undefined);
}
