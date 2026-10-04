import { create } from 'zustand';

export type AuthUser = { uid: string; email: string; displayName: string | null };

export type AuthStatus = 'initializing' | 'signedOut' | 'signedIn';

type AuthState = {
  status: AuthStatus;
  user: AuthUser | null;
  /** True between the user confirming logout and Firebase finishing sign-out. */
  signingOut: boolean;
  setUser: (user: AuthUser | null) => void;
  setSigningOut: (value: boolean) => void;
};

export const useAuthStore = create<AuthState>()((set) => ({
  status: 'initializing',
  user: null,
  signingOut: false,
  setUser: (user) => set({ user, status: user ? 'signedIn' : 'signedOut' }),
  setSigningOut: (signingOut) => set({ signingOut }),
}));
