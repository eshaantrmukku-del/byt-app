// Seeds the local emulators with owner@example.com / Test-12345, shaped like a real
// prototype account (tests/fixtures/legacy-user.json). Emulator only: never production.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('Emulator hosts are not set; refusing to seed.');
}

initializeApp({ projectId: 'demo-byt' });

async function main() {
  const auth = getAuth();
  const existing = await auth.getUserByEmail('owner@example.com').catch(() => null);
  if (existing) {
    console.log('already seeded', existing.uid);
    return;
  }
  const fixture = JSON.parse(readFileSync(resolve(__dirname, '../../tests/fixtures/legacy-user.json'), 'utf8'));
  const user = await auth.createUser({ email: 'owner@example.com', password: 'Test-12345', displayName: 'Eshaan' });
  await getFirestore().doc(`users/${user.uid}`).set({ ...fixture, updatedAt: Timestamp.now() });
  console.log('seeded', user.uid);
}
void main();
