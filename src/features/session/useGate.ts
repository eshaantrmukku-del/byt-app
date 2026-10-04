import { useAuthStore } from '@/stores/authStore';
import { useProfileStore } from '@/stores/profileStore';

import { deriveGate, type Gate } from './gate';

export function useGate(): Gate {
  const authStatus = useAuthStore((s) => s.status);
  const profileStatus = useProfileStore((s) => s.status);
  const onboardingCompleted = useProfileStore((s) => s.profile?.onboardingCompleted);
  return deriveGate(authStatus, profileStatus, onboardingCompleted);
}
