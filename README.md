# BYT — Build Your Tomorrow

Private AI coaching app. Expo (SDK 54) + Expo Router, TypeScript (strict), Firebase Auth + Firestore, Zustand.

## Layout

```
app/                    routes (Expo Router)
  index.tsx             animated splash, routes by session state
  auth/                 login, sign-up
  onboarding.tsx        3-step profile intake
  edit-profile.tsx
  (tabs)/               Home, Settings
src/
  config/env.ts         env schema (EXPO_PUBLIC_FIREBASE_* only)
  lib/firebase.ts       Firebase init (+ optional emulators)
  types/models.ts       Firestore data model (schema v2)
  features/             pure domain logic (profile, auth, session gate)
  services/             auth, profile, session (cloud-first hydration), write tracking
  stores/               Zustand: auth, profile, sync
  ui/                   design system (dark, accent #3B82F6)
firestore.rules         security rules (owner-only, validated)
tests/unit              logic tests (vitest)
tests/rules             rules tests against the Firestore emulator
```

## Develop

```bash
npm install
cp .env.example .env        # fill in Firebase client config
npm run start:lan           # Expo Go on the same Wi-Fi
npm run start:tunnel        # Expo Go from any network
npm run qr -- qr.png        # QR for the running dev server
```

## Checks

```bash
npm run verify              # env check + typecheck + lint + unit tests
npm run test:rules          # Firestore rules in the emulator (needs Java 21+)
```

## Deploy Firestore rules

```bash
npx firebase login
npm run deploy:rules        # firestore.rules + indexes → ascend-9d17e
```

## Safety

- Never run `expo prebuild --clean`: `android/` holds the Play upload keystore.
- Never put AI/voice provider keys in `EXPO_PUBLIC_*` variables; they belong in backend secrets.
- Android package `com.LiveYourPotential.myapp` is the live Play Store identity — don't change it.
