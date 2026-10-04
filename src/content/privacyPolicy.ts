/** Shared privacy policy copy for the in-app screen. Keep in step with website/privacy. */
export const PRIVACY_CONTACT_EMAIL = 'eshaantr.mukku@gmail.com';

/** Public privacy policy URL (BYT marketing site). */
export const PRIVACY_POLICY_URL = 'https://eshaantrmukku-del.github.io/byt-website/privacy/';

/** Public URL for account & data deletion requests (Play Console / in-app). */
export const ACCOUNT_DELETION_URL = 'https://eshaantrmukku-del.github.io/byt-website/delete-account/';

export const PRIVACY_EFFECTIVE_DATE = '11 July 2026';
export const PRIVACY_LAST_UPDATED = '4 October 2026';

export type PrivacySection = {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

export const PRIVACY_SECTIONS: PrivacySection[] = [
  {
    id: 'collect',
    title: 'What we collect',
    paragraphs: ['To run the app we need a few things you provide or create while using BYT:'],
    bullets: [
      'Account details (name, email) so you can sign in',
      'Your coach intake: date of birth, profession, goals and any optional details you add',
      'Goals, check-ins, journal entries, and coach chat content you create',
      'Voice audio only if you use Voice coaching (to understand you and reply)',
    ],
  },
  {
    id: 'not-collected',
    title: 'What we don’t collect',
    paragraphs: [
      'BYT does not ask for or store a profile photo. We don’t access your contacts, location or photo library.',
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
      'Trusted providers help us run the app (account and cloud sync with Google Firebase, AI replies, and text-to-speech). They process data only to deliver those features — not to sell it.',
    ],
  },
  {
    id: 'security',
    title: 'Keeping it private',
    paragraphs: ['Your data can only be accessed by your signed-in account. This is enforced on our servers, not just in the app.'],
  },
  {
    id: 'rights',
    title: 'Your choices',
    paragraphs: [
      'You can stop using the app at any time. You can turn off microphone access in your phone settings.',
      `To delete your account and associated data, email ${PRIVACY_CONTACT_EMAIL} with the subject “Delete my BYT account and data”, or use ${ACCOUNT_DELETION_URL}.`,
    ],
  },
  {
    id: 'contact',
    title: 'Contact',
    paragraphs: [`Questions: ${PRIVACY_CONTACT_EMAIL}`],
  },
];
