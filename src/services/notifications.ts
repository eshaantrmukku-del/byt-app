import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router } from 'expo-router';
import { AppState, Platform } from 'react-native';

import { planNotifications } from '@/features/notifications/plan';
import { useAuthStore } from '@/stores/authStore';
import { useCoachMemoryStore } from '@/stores/coachMemoryStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useUserDataStore } from '@/stores/userDataStore';

/**
 * Reminders are scheduled on the device (no push server): check-in reminders,
 * commitment nudges and a "welcome back" after a quiet spell. The whole plan is
 * rebuilt whenever its inputs change or the app comes to the foreground.
 */

const CHANNEL_ID = 'reminders';
const SUPPORTED = Platform.OS === 'android' || Platform.OS === 'ios';

if (SUPPORTED) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export async function notificationPermission(): Promise<PermissionState> {
  if (!SUPPORTED) return 'denied';
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

/** Asks once; on Android 13+ and iOS this shows the system prompt. */
export async function requestNotificationPermission(): Promise<PermissionState> {
  if (!SUPPORTED) return 'denied';
  await ensureChannel();
  const { status } = await Notifications.requestPermissionsAsync();
  return status;
}

let channelReady = false;
async function ensureChannel() {
  if (Platform.OS !== 'android' || channelReady) return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Reminders',
    description: 'Check-in reminders and nudges about what you told your coach you’d do',
    importance: AndroidImportance.DEFAULT,
  });
  channelReady = true;
}

let syncing: Promise<void> | null = null;
let again = false;

/** Replaces every scheduled reminder with the current plan. Safe to call often. */
export function syncNotifications(): Promise<void> {
  if (!SUPPORTED) return Promise.resolve();
  if (syncing) {
    again = true;
    return syncing;
  }
  syncing = runSync()
    .catch(() => undefined)
    .finally(() => {
      syncing = null;
      if (again) {
        again = false;
        void syncNotifications();
      }
    });
  return syncing;
}

async function runSync() {
  const signedIn = Boolean(useAuthStore.getState().user);
  const prefs = usePreferencesStore.getState();
  const plan = signedIn
    ? planNotifications({
        now: new Date(),
        checkInReminders: prefs.pushNotifications,
        nudges: prefs.smartNudges,
        reminderHour: prefs.reminderHour,
        checkedIn: new Set(useUserDataStore.getState().checkIns.items.map((c) => c.date)),
        commitments: useCoachMemoryStore.getState().commitments,
      })
    : [];
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (plan.length === 0) return;
  let permission = await notificationPermission();
  // Ask the first time they make a commitment to the coach, when the reason is obvious.
  const committed = plan.some((n) => n.id.startsWith('commit-'));
  if (permission === 'undetermined' && committed && !prefs.notificationsAsked && AppState.currentState === 'active') {
    usePreferencesStore.getState().markNotificationsAsked();
    permission = await requestNotificationPermission();
  }
  if (permission !== 'granted') return;
  await ensureChannel();
  for (const n of plan) {
    await Notifications.scheduleNotificationAsync({
      identifier: n.id,
      content: { title: n.title, body: n.body, data: { url: n.url } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.at, channelId: CHANNEL_ID },
    });
  }
}

/** A tap on a reminder opens its screen; held until the app is signed in and ready. */
let pendingUrl: string | null = null;

function openFrom(response: Notifications.NotificationResponse | null) {
  const url = response?.notification.request.content.data?.url;
  if (url === '/check-in' || url === '/ai-coach') pendingUrl = url;
}

/** Call when the signed-in app is ready to navigate. */
export function consumePendingNotification() {
  if (!pendingUrl) return;
  const url = pendingUrl;
  pendingUrl = null;
  // Let the signed-in stack mount before navigating into it.
  setTimeout(() => router.push(url as '/check-in' | '/ai-coach'), 300);
}

/** Wires reminders to the stores and app lifecycle. Call once from the root layout. */
export function startNotifications(onOpen: () => void): () => void {
  if (!SUPPORTED) return () => undefined;
  openFrom(Notifications.getLastNotificationResponse());
  const tap = Notifications.addNotificationResponseReceivedListener((response) => {
    openFrom(response);
    onOpen();
  });

  let timer: ReturnType<typeof setTimeout> | null = null;
  const soon = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void syncNotifications(), 800);
  };
  const stops = [
    usePreferencesStore.subscribe(soon),
    useAuthStore.subscribe((s, prev) => s.user?.uid !== prev.user?.uid && soon()),
    useUserDataStore.subscribe((s, prev) => s.checkIns.items !== prev.checkIns.items && soon()),
    useCoachMemoryStore.subscribe(soon),
  ];
  const app = AppState.addEventListener('change', (state) => state === 'active' && soon());
  soon();

  return () => {
    if (timer) clearTimeout(timer);
    tap.remove();
    app.remove();
    stops.forEach((stop) => stop());
  };
}
