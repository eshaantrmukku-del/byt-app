import type { AuthStatus } from '@/stores/authStore';
import type { ProfileStatus } from '@/stores/profileStore';

/** Where the app should be, derived from auth + profile state. */
export type Gate = 'booting' | 'signedOut' | 'loadingProfile' | 'profileUnavailable' | 'onboarding' | 'ready';

export function deriveGate(
  authStatus: AuthStatus,
  profileStatus: ProfileStatus,
  onboardingCompleted: boolean | undefined
): Gate {
  if (authStatus === 'initializing') return 'booting';
  if (authStatus === 'signedOut') return 'signedOut';
  if (profileStatus === 'unavailable') return 'profileUnavailable';
  if (profileStatus !== 'ready') return 'loadingProfile';
  return onboardingCompleted ? 'ready' : 'onboarding';
}
