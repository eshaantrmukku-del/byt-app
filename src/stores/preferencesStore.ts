import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type PreferenceKey = 'voiceInteraction' | 'smartNudges' | 'pushNotifications';

/** Device-level app preferences (Settings → Preferences). Not account data. */
type PreferencesState = Record<PreferenceKey, boolean> & {
  set: (key: PreferenceKey, value: boolean) => void;
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      voiceInteraction: true,
      smartNudges: true,
      pushNotifications: false,
      set: (key, value) => set({ [key]: value }),
    }),
    {
      name: 'byt-preferences-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ voiceInteraction, smartNudges, pushNotifications }) => ({
        voiceInteraction,
        smartNudges,
        pushNotifications,
      }),
    }
  )
);
