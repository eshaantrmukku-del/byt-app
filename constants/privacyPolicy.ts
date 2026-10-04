/** Shared privacy policy copy for the website and in-app screen. */
export const PRIVACY_CONTACT_EMAIL = 'eshaantr.mukku@gmail.com';

/** Public privacy policy URL (BYT marketing site on GitHub Pages). */
export const PRIVACY_POLICY_URL = 'https://eshaantrmukku-del.github.io/byt-website/privacy/';

/** Public URL for account & data deletion requests (Play Console / in-app). */
export const ACCOUNT_DELETION_URL = 'https://eshaantrmukku-del.github.io/byt-website/delete-account/';

export const ACCOUNT_DELETION_MAILTO =
  `mailto:${PRIVACY_CONTACT_EMAIL}?subject=${encodeURIComponent('Delete my BYT account and data')}&body=${encodeURIComponent(
    'Please delete my BYT account and all associated data.\n\nAccount email: '
  )}`;

export const PRIVACY_EFFECTIVE_DATE = '11 July 2026';
export const PRIVACY_LAST_UPDATED = '11 July 2026';

export type PrivacySection = {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

export const PRIVACY_SECTIONS: PrivacySection[] = [
  {
    id: 'overview',
    title: 'Overview',
    paragraphs: [
      'BYT (Build Your Tomorrow) is a coaching app. This short notice explains how we handle your information.',
      'We do not sell your personal data. We do not rent or trade it to advertisers.',
    ],
  },
  {
    id: 'collect',
    title: 'What we collect',
    paragraphs: [
      'To run the app we need a few things you provide or create while using BYT:',
    ],
    bullets: [
      'Account details (name, email) so you can sign in',
      'Goals, check-ins, and coach chat content you create',
      'Voice audio only if you use Voice coaching (to understand you and reply)',
    ],
  },
  {
    id: 'use',
    title: 'How we use it',
    paragraphs: [
      'We use this information only to provide BYT: keep you signed in, sync your data across devices, power the AI coach, and run voice replies when you ask for them.',
    ],
  },
  {
    id: 'providers',
    title: 'Services we use',
    paragraphs: [
      'Trusted providers help us run the app (for example account/cloud sync, AI replies, and text-to-speech). They process data only to deliver those features — not to sell it.',
    ],
  },
  {
    id: 'rights',
    title: 'Your choices',
    paragraphs: [
      'You can stop using the app at any time. You can turn off microphone access in your phone settings.',
      `To delete your account and associated data, use ${ACCOUNT_DELETION_URL} or email ${PRIVACY_CONTACT_EMAIL} with the subject “Delete my BYT account and data”.`,
    ],
  },
  {
    id: 'contact',
    title: 'Contact',
    paragraphs: [`Questions: ${PRIVACY_CONTACT_EMAIL}`],
  },
];
