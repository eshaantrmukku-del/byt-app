const MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'That email address doesn’t look right.',
  'auth/missing-email': 'Enter your email address.',
  'auth/missing-password': 'Enter your password.',
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/wrong-password': 'Email or password is incorrect.',
  'auth/user-not-found': 'Email or password is incorrect.',
  'auth/user-disabled': 'This account has been disabled. Contact support if this is unexpected.',
  'auth/email-already-in-use': 'An account with this email already exists. Try logging in.',
  'auth/weak-password': 'Choose a stronger password (at least 8 characters).',
  'auth/password-does-not-meet-requirements': 'Choose a stronger password (at least 8 characters).',
  'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
  'auth/network-request-failed': 'No connection. Check your internet and try again.',
  'auth/operation-not-allowed': 'Email sign-in isn’t enabled for BYT yet.',
};

const FIRESTORE_MESSAGES: Record<string, string> = {
  'permission-denied': 'Your account data couldn’t be accessed. Please try again or contact support.',
  unavailable: 'Can’t reach BYT right now. Check your connection and try again.',
  'deadline-exceeded': 'This is taking too long. Check your connection and try again.',
};

function codeOf(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

/** User-facing message for an auth or Firestore error. Never echoes raw error text. */
export function friendlyError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const code = codeOf(error);
  if (!code) return fallback;
  return MESSAGES[code] ?? FIRESTORE_MESSAGES[code.replace(/^firestore\//, '')] ?? fallback;
}

export const MIN_PASSWORD_LENGTH = 8;

export function validateEmail(email: string): string | null {
  const value = email.trim();
  if (!value) return 'Enter your email address.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'That email address doesn’t look right.';
  return null;
}

export function validateNewPassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}
