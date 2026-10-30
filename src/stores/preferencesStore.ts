import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { CoachThinking, CoachVoice } from '@/services/coach/types';

export type PreferenceKey = 'voiceInteraction' | 'smartNudges' | 'pushNotifications';

/** Device-level app preferences (Settings → Preferences). Not account data. */
type PreferencesState = Record<PreferenceKey, boolean> & {
  /** How long the coach thinks before replying. Deeper is slower and uses more of the day's allowance. */
  coachThinking: CoachThinking;
  /** Who the coach sounds like in voice sessions. */
  coachVoice: CoachVoice;
  /** Local hour for the daily check-in reminder. */
  reminderHour: number;
  /** The notification permission prompt has been shown once already. */
  notificationsAsked: boolean;
  set: (key: PreferenceKey, value: boolean) => void;
  setCoachThinking: (value: CoachThinking) => void;
  setCoachVoice: (value: CoachVoice) => void;
  setReminderHour: (hour: number) => void;
  markNotificationsAsked: () => void;
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      voiceInteraction: true,
      smartNudges: true,
      pushNotifications: false,
      coachThinking: 'standard',
      coachVoice: 'ivy',
      reminderHour: 20,
      notificationsAsked: false,
      set: (key, value) => set({ [key]: value }),
      setCoachThinking: (coachThinking) => set({ coachThinking }),
      setCoachVoice: (coachVoice) => set({ coachVoice }),
      setReminderHour: (reminderHour) => set({ reminderHour }),
      markNotificationsAsked: () => set({ notificationsAsked: true }),
    }),
    {
      name: 'byt-preferences-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ voiceInteraction, smartNudges, pushNotifications, coachThinking, coachVoice, reminderHour, notificationsAsked }) => ({
        voiceInteraction,
        smartNudges,
        pushNotifications,
        coachThinking,
        coachVoice,
        reminderHour,
        notificationsAsked,
      }),
    }
  )
);
