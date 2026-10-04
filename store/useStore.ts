import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist, StateStorage } from 'zustand/middleware';

export type Goal = {
  id: string;
  title: string;
  category: 'Career' | 'Health' | 'Personal' | 'Finance' | 'Fitness' | 'Learning' | 'Social' | 'Creativity' | 'Other';
  status: 'Active' | 'Completed' | 'Stuck' | 'Just Started';
  progress: number;
  image?: string;
  type?: 'active' | 'stuck' | 'completed';
};

export type CheckIn = {
  id: string;
  date: string;
  mood: string;
  notes: string;
  /** 1–10 overall vitality / happiness (legacy field name `energy` kept for compatibility) */
  energy: number;
  happiness: number;
  stress: number;
  sleep: number;
  reflection: string;
  win: string;
};

export type JournalEntry = {
  id: string;
  date: string;
  text: string;
};

export type CoachProfile = {
  /** ISO date YYYY-MM-DD — preferred; age is computed from this */
  dateOfBirth?: string;
  /** @deprecated Legacy text age from older installs; kept for migration */
  age?: string;
  profession: string;
  goalsSummary: string;
  income?: string;
  lifestyleNotes?: string;
  struggles?: string;
  coachNotes?: string;
};

export type SubscriptionPlan = 'standard' | 'plus';

export type MergeRemoteUserPartial = {
  goals?: Goal[];
  checkIns?: CheckIn[];
  journalEntries?: JournalEntry[];
  coachProfile?: CoachProfile | null;
  onboardingCompleted?: boolean;
  displayName?: string;
  subscriptionPlan?: SubscriptionPlan;
  creditsRemaining?: number;
  creditsPeriodKey?: string;
};

/** Monthly pool; each user-sent coach message costs 1 credit. AI openers/replies are free. */
export const MONTHLY_CREDIT_ALLOWANCE = 150;

function currentPeriodKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function normalizeCheckIn(raw: Partial<CheckIn> & { id: string; date: string; mood: string; notes?: string; energy?: number }): CheckIn {
  const energy = typeof raw.energy === 'number' ? raw.energy : 5;
  const happiness = typeof raw.happiness === 'number' ? raw.happiness : energy;
  const stress = typeof raw.stress === 'number' ? raw.stress : 5;
  const sleep = typeof raw.sleep === 'number' ? raw.sleep : 5;
  const reflection = raw.reflection ?? '';
  const win = raw.win ?? '';
  let notes = raw.notes ?? '';
  if (!notes && (reflection || win)) {
    notes = [reflection, win].filter(Boolean).join('\n\n');
  }
  return {
    id: raw.id,
    date: raw.date,
    mood: raw.mood,
    notes,
    energy,
    happiness,
    stress,
    sleep,
    reflection,
    win,
  };
}

function normalizeJournalEntry(raw: Partial<JournalEntry>): JournalEntry | null {
  const text = typeof raw.text === 'string' ? raw.text.trim() : '';
  if (!text) return null;
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id : Date.now().toString();
  const date = typeof raw.date === 'string' && raw.date.trim() ? raw.date : new Date().toISOString();
  return { id, date, text };
}

type AppState = {
  user: { name: string; email: string; uid: string } | null;
  goals: Goal[];
  checkIns: CheckIn[];
  journalEntries: JournalEntry[];
  coachProfile: CoachProfile | null;
  onboardingCompleted: boolean;
  subscriptionPlan: SubscriptionPlan;
  creditsRemaining: number;
  creditsPeriodKey: string;
  isHydrated: boolean;
  firebaseAuthReady: boolean;

  login: (name: string, email: string, uid: string) => void;
  updateUserName: (name: string) => void;
  logout: () => void;
  setCoachProfile: (profile: CoachProfile) => void;
  setOnboardingCompleted: (done: boolean) => void;
  setSubscriptionPlan: (plan: SubscriptionPlan) => void;
  ensureCreditsForCurrentMonth: () => void;
  consumeCredit: () => boolean;
  refundCredit: () => void;
  addGoal: (goal: Omit<Goal, 'id'>) => void;
  updateGoal: (id: string, updates: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;
  addCheckIn: (checkIn: Omit<CheckIn, 'id'>) => void;
  addJournalEntry: (entry: Omit<JournalEntry, 'id'>) => void;
  setHydrated: (state: boolean) => void;
  setFirebaseAuthReady: (ready: boolean) => void;
  hydrateStore: (goals: Goal[], checkIns: CheckIn[]) => void;
  mergeRemoteUserState: (partial: MergeRemoteUserPartial) => void;
};

const safeWebStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      if (Platform.OS === 'web' && typeof window === 'undefined') {
        return null;
      }
      return await AsyncStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      if (Platform.OS === 'web' && typeof window === 'undefined') {
        return;
      }
      await AsyncStorage.setItem(name, value);
    } catch {
      // silently fail on SSR
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      if (Platform.OS === 'web' && typeof window === 'undefined') {
        return;
      }
      await AsyncStorage.removeItem(name);
    } catch {
      // silently fail on SSR
    }
  },
};

let profileFlushSuppressDepth = 0;
/** Uid whose display name was loaded from Firestore or an explicit edit. */
let cloudDisplayNameUid: string | null = null;

function lockCloudDisplayName(uid: string | undefined) {
  if (uid) cloudDisplayNameUid = uid;
}

/** Auth session updates should not look like an unsaved profile edit. */
export function withSuppressedProfileFlush(fn: () => void) {
  profileFlushSuppressDepth += 1;
  try {
    fn();
  } finally {
    profileFlushSuppressDepth -= 1;
  }
}

export function isProfileFlushSuppressed() {
  return profileFlushSuppressDepth > 0;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: null,
      goals: [],
      checkIns: [],
      journalEntries: [],
      coachProfile: null,
      onboardingCompleted: true,
      subscriptionPlan: 'standard',
      creditsRemaining: MONTHLY_CREDIT_ALLOWANCE,
      creditsPeriodKey: currentPeriodKey(),
      isHydrated: false,
      firebaseAuthReady: false,

      login: (name, email, uid) =>
        set((state) => {
          const incoming = name.trim();
          const existing = state.user?.uid === uid ? state.user.name.trim() : '';
          // A later auth callback often only has the email prefix. Keep the name
          // Firestore (or an explicit edit) already stored for this account.
          const keepCloudName = cloudDisplayNameUid === uid && !!existing && !!incoming && existing !== incoming;
          if (!keepCloudName && state.user?.uid !== uid) cloudDisplayNameUid = null;
          const nextName = keepCloudName ? existing : incoming || existing;
          return { user: { name: nextName || 'User', email, uid } };
        }),
      updateUserName: (name) =>
        set((state) => {
          if (!state.user) return {};
          lockCloudDisplayName(state.user.uid);
          return { user: { ...state.user, name: name.trim() || state.user.name } };
        }),
      logout: () => {
        cloudDisplayNameUid = null;
        set({
          user: null,
          goals: [],
          checkIns: [],
          journalEntries: [],
          coachProfile: null,
          onboardingCompleted: true,
          subscriptionPlan: 'standard',
          creditsRemaining: MONTHLY_CREDIT_ALLOWANCE,
          creditsPeriodKey: currentPeriodKey(),
        });
      },

      setCoachProfile: (profile) => set({ coachProfile: profile }),
      setOnboardingCompleted: (done) => set({ onboardingCompleted: done }),
      setSubscriptionPlan: (plan) => set({ subscriptionPlan: plan }),

      ensureCreditsForCurrentMonth: () => {
        const key = currentPeriodKey();
        const s = get();
        if (s.creditsPeriodKey !== key) {
          set({
            creditsPeriodKey: key,
            creditsRemaining: MONTHLY_CREDIT_ALLOWANCE,
          });
        }
      },

      consumeCredit: () => {
        get().ensureCreditsForCurrentMonth();
        const s = get();
        if (s.creditsRemaining <= 0) return false;
        set({ creditsRemaining: s.creditsRemaining - 1 });
        return true;
      },

      refundCredit: () => {
        set((state) => ({
          creditsRemaining: Math.min(MONTHLY_CREDIT_ALLOWANCE, state.creditsRemaining + 1),
        }));
      },

      addGoal: (goal) => {
        const id = Date.now().toString();
        const newGoal = { ...goal, id };
        set((state) => ({ goals: [...state.goals, newGoal] }));
      },

      updateGoal: (id, updates) => {
        set((state) => ({
          goals: state.goals.map((g) => (g.id === id ? { ...g, ...updates } : g)),
        }));
      },

      deleteGoal: (id) => {
        set((state) => ({
          goals: state.goals.filter((g) => g.id !== id),
        }));
      },

      addCheckIn: (checkIn) => {
        const id = Date.now().toString();
        const normalized = normalizeCheckIn({ ...checkIn, id });
        set((state) => ({ checkIns: [...state.checkIns, normalized] }));
      },

      addJournalEntry: (entry) => {
        const normalized = normalizeJournalEntry(entry);
        if (!normalized) return;
        set((state) => ({ journalEntries: [...state.journalEntries, normalized] }));
      },

      setHydrated: (state) => set({ isHydrated: state }),
      setFirebaseAuthReady: (ready) => set({ firebaseAuthReady: ready }),
      hydrateStore: (goals, checkIns) => {
        get().mergeRemoteUserState({ goals, checkIns });
      },

      mergeRemoteUserState: (partial: MergeRemoteUserPartial) => {
        set((state) => {
          const next: Partial<AppState> = {};
          if (partial.goals !== undefined) next.goals = partial.goals;
          if (partial.checkIns !== undefined) {
            next.checkIns = partial.checkIns.map((c) => normalizeCheckIn(c as CheckIn));
          }
          if (partial.journalEntries !== undefined) {
            next.journalEntries = partial.journalEntries
              .map((entry) => normalizeJournalEntry(entry))
              .filter((entry): entry is JournalEntry => entry !== null);
          }
          if (partial.coachProfile !== undefined) next.coachProfile = partial.coachProfile;
          if (partial.onboardingCompleted !== undefined) next.onboardingCompleted = partial.onboardingCompleted;
          if (partial.displayName !== undefined && state.user) {
            const name = partial.displayName.trim() || state.user.name;
            lockCloudDisplayName(state.user.uid);
            next.user = { ...state.user, name };
          }
          if (partial.subscriptionPlan !== undefined) next.subscriptionPlan = partial.subscriptionPlan;
          if (typeof partial.creditsRemaining === 'number') next.creditsRemaining = partial.creditsRemaining;
          if (partial.creditsPeriodKey !== undefined) next.creditsPeriodKey = partial.creditsPeriodKey;
          return { ...state, ...next };
        });
        get().ensureCreditsForCurrentMonth();
      },
    }),
    {
      name: 'ascend-storage-v6',
      storage: createJSONStorage(() => safeWebStorage),
      partialize: (state) => ({
        user: state.user,
        goals: state.goals,
        checkIns: state.checkIns,
        journalEntries: state.journalEntries,
        coachProfile: state.coachProfile,
        onboardingCompleted: state.onboardingCompleted,
        subscriptionPlan: state.subscriptionPlan,
        creditsRemaining: state.creditsRemaining,
        creditsPeriodKey: state.creditsPeriodKey,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn('Rehydration failed:', error);
        }
        setTimeout(() => {
          useStore.getState().setHydrated(true);
          useStore.getState().ensureCreditsForCurrentMonth();
        }, 0);
      },
    }
  )
);
