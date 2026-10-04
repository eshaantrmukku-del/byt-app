/**
 * Validates .env without printing any values.
 * - required Firebase client keys must be present
 * - provider secrets must never be EXPO_PUBLIC_* (they would ship in the bundle)
 */
const fs = require('fs');
const path = require('path');

const REQUIRED = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
];
const FORBIDDEN_PUBLIC = /^EXPO_PUBLIC_.*(GEMINI|DEEPGRAM|OPENAI|SECRET|PRIVATE|TOKEN)/;

function parse(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const file = path.join(__dirname, '..', '.env');
if (!fs.existsSync(file)) {
  console.error('check-env: .env not found. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const vars = parse(file);
const missing = REQUIRED.filter((k) => !vars[k]);
const exposed = Object.keys(vars).filter((k) => FORBIDDEN_PUBLIC.test(k) && vars[k]);

if (exposed.length) {
  console.warn(
    `check-env: WARNING — ${exposed.join(', ')} ${exposed.length === 1 ? 'is' : 'are'} set as EXPO_PUBLIC_*. ` +
      'The app does not read them, but remove them from .env: provider keys belong in backend secrets.'
  );
}
if (missing.length) {
  console.error(`check-env: missing ${missing.join(', ')}`);
  process.exit(1);
}
console.log('check-env: ok');
