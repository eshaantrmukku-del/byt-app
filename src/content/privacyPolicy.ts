/** Shared privacy policy copy for the in-app screen. Keep in step with website/privacy. */
export const PRIVACY_CONTACT_EMAIL = 'eshaantr.mukku@gmail.com';

/** Public privacy policy URL (BYT marketing site). */
export const PRIVACY_POLICY_URL = 'https://eshaantrmukku-del.github.io/byt-website/privacy/';

/** Public URL for account & data deletion requests (Play Console / in-app). */
export const ACCOUNT_DELETION_URL = 'https://eshaantrmukku-del.github.io/byt-website/delete-account/';

export const PRIVACY_EFFECTIVE_DATE = '11 July 2026';
export const PRIVACY_LAST_UPDATED = '29 October 2026';

export type PrivacySection = {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

export const PRIVACY_SECTIONS: PrivacySection[] = [
  {
    id: 'promises',
    title: 'In short',
    paragraphs: [
      'We never sell, rent or trade your data. BYT has no ads and no analytics trackers. You can delete your account and everything in it at any time.',
    ],
  },
  {
    id: 'collect',
    title: 'What we collect',
    paragraphs: ['Only what the app needs to work for you:'],
    bullets: [
      'Your name and email, so you can sign in. Your password is handled by Google’s sign-in service; we never see it.',
      'What you share when you set up: date of birth, work, goals, lifestyle and what you’re finding hard',
      'Goals, daily check-ins (mood, stress, sleep, reflections) and journal entries',
      'Your coach conversations, text and voice, saved as text',
      'Short notes the coach keeps to remember you: past session summaries, how you like to be coached, what matters to you and commitments you’ve made',
      'How much of today’s coaching allowance you’ve used',
    ],
  },
  {
    id: 'not-collected',
    title: 'What we don’t keep',
    paragraphs: [
      'Voice audio is never stored: it’s transcribed and answered, then discarded. Reminders are scheduled on your phone, and your settings stay on your device. We don’t access your contacts, location or photos.',
    ],
  },
  {
    id: 'use',
    title: 'How we use it',
    paragraphs: [
      'Only to provide BYT: to keep you signed in, sync your data, coach you (the coach reads your profile, goals, recent check-ins and its notes so replies fit you), send the reminders you switch on, and keep the service secure. Never for advertising.',
    ],
  },
  {
    id: 'coach',
    title: 'The AI coach',
    paragraphs: [
      'The coach is an AI, not a person, and nobody reads your conversations to run the app. It can be wrong, so treat what it says as a perspective. BYT is not therapy or medical care. In an emergency, call 999 in the UK or Samaritans on 116 123.',
    ],
  },
  {
    id: 'providers',
    title: 'Services we use',
    paragraphs: [
      'Google Firebase and Google Cloud run sign-in, storage and our servers. Google’s Gemini API generates coach replies and handles voice, under paid terms that don’t allow your conversations to be used to train its models.',
    ],
  },
  {
    id: 'security',
    title: 'Keeping it private',
    paragraphs: [
      'Your data is encrypted, and only your signed-in account can read it. This is enforced on our servers, not just in the app. The coach’s notes and your allowance can only be written by our servers.',
    ],
  },
  {
    id: 'rights',
    title: 'Your choices',
    paragraphs: [
      'Delete your account and all its data any time in Settings → Delete account & data. It’s permanent and immediate.',
      'Switch reminders on or off in Settings → Reminders. Turn off microphone access in your phone’s settings.',
      `You can also ask for a copy of your data, or use your other rights under UK data protection law, by emailing ${PRIVACY_CONTACT_EMAIL}. You can complain to the ICO at ico.org.uk.`,
    ],
  },
  {
    id: 'contact',
    title: 'Contact',
    paragraphs: [`BYT is made by Eshaan Mukku in the UK. Questions: ${PRIVACY_CONTACT_EMAIL}`],
  },
];
