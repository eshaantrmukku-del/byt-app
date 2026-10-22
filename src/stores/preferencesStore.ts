import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { CoachThinking } from '@/services/coach/types';

export type PreferenceKey = 'voiceInteraction' | 'smartNudges' | 'pushNotifications';

/** Device-level app preferences (Settings → Preferences). Not account data. */
type PreferencesState = Record<PreferenceKey, boolean> & {
  /** How long the coach thinks before replying. Deeper is slower and uses more of the day's allowance. */
  coachThinking: CoachThinking;
  set: (key: PreferenceKey, value: boolean) => void;
  setCoachThinking: (value: CoachThinking) => void;
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      voiceInteraction: true,
      smartNudges: true,
      pushNotifications: false,
      coachThinking: 'standard',
      set: (key, value) => set({ [key]: value }),
      setCoachThinking: (coachThinking) => set({ coachThinking }),
    }),
    {
      name: 'byt-preferences-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ voiceInteraction, smartNudges, pushNotifications, coachThinking }) => ({
        voiceInteraction,
        smartNudges,
        pushNotifications,
        coachThinking,
      }),
    }
  )
);
