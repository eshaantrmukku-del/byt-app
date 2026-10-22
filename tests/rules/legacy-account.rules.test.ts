import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteField, doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc, type Firestore } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildLegacyUpgrade } from '@/features/profile/profileDoc';

/**
 * The live account is still a prototype users/{uid} document holding profile,
 * goals, check-ins, journal, chats and credits. These rules must keep it readable
 * and editable before `npm run deploy:rules`, and must never let a write drop it.
 */

const OWNER = { uid: 'owner', email: 'owner@example.com' };
const OTHER = { uid: 'other', email: 'other@example.com' };
const PATH = `users/${OWNER.uid}`;
const fixture = JSON.parse(readFileSync('tests/fixtures/legacy-user.json', 'utf8')) as Record<string, unknown>;
const LEGACY_KEYS = ['goals', 'checkIns', 'journalEntries', 'chats', 'coachProfile', 'creditsRemaining', 'creditsPeriodKey', 'subscriptionPlan'];

let env: RulesTestEnvironment;

function dbFor(user: { uid: string; email: string }): Firestore {
  return env.authenticatedContext(user.uid, { email: user.email }).firestore() as unknown as Firestore;
}

async function seed(data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore() as unknown as Firestore, PATH), { ...data, updatedAt: Timestamp.fromMillis(1_760_000_000_000) });
  });
}

async function stored(): Promise<Record<string, unknown>> {
  let data: Record<string, unknown> = {};
  await env.withSecurityRulesDisabled(async (ctx) => {
    data = (await getDoc(doc(ctx.firestore() as unknown as Firestore, PATH))).data() ?? {};
  });
  return data;
}

function expectLegacyIntact(data: Record<string, unknown>) {
  for (const key of LEGACY_KEYS) expect(data[key], key).toEqual(fixture[key]);
}

/** The write upgradeLegacyProfile() makes on the phone. */
function upgradeWrite(data: Record<string, unknown>) {
  return {
    ...buildLegacyUpgrade(data, { displayName: '', email: OWNER.email }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-byt', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed(fixture);
});

afterAll(async () => {
  await env.cleanup();
});

describe('a real prototype account on users/{uid}', () => {
  it('can be read by its owner, with every embedded field', async () => {
    const snap = await assertSucceeds(getDoc(doc(dbFor(OWNER), PATH)));
    expect(snap.data()).toMatchObject(fixture);
  });

  it('cannot be read, written or deleted by anyone else, or deleted by the owner', async () => {
    await assertFails(getDoc(doc(dbFor(OTHER), PATH)));
    await assertFails(updateDoc(doc(dbFor(OTHER), PATH), { profession: 'x', updatedAt: serverTimestamp() }));
    await assertFails(env.unauthenticatedContext().firestore().doc(PATH).get());
  });

  it('accepts the app’s upgrade write and keeps all embedded data', async () => {
    await assertSucceeds(updateDoc(doc(dbFor(OWNER), PATH), upgradeWrite(fixture)));
    const after = await stored();
    expect(after).toMatchObject({ schemaVersion: 2, displayName: 'Eshaan', profession: 'Student', dateOfBirth: '2005-03-15' });
    expectLegacyIntact(after);
  });

  it('accepts profile edits before and after the upgrade, keeping embedded data', async () => {
    const ref = doc(dbFor(OWNER), PATH);
    await assertSucceeds(updateDoc(ref, { coachNotes: 'Ask me hard questions', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(ref, upgradeWrite(await stored())));
    await assertSucceeds(updateDoc(ref, { profession: 'Founder', dateOfBirth: '2005-03-16', onboardingCompleted: true, updatedAt: serverTimestamp() }));
    expectLegacyIntact(await stored());
  });

  it('does not lock out an account whose prototype name was empty', async () => {
    await seed({ ...fixture, displayName: '' });
    const ref = doc(dbFor(OWNER), PATH);
    await assertSucceeds(updateDoc(ref, upgradeWrite(await stored())));
    await assertSucceeds(updateDoc(ref, { profession: 'Founder', updatedAt: serverTimestamp() }));
    // A name the user sets must still be valid, and can't be cleared again.
    await assertSucceeds(updateDoc(ref, { displayName: 'Eshaan', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { displayName: '', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { displayName: 'x'.repeat(61), updatedAt: serverTimestamp() }));
  });

  it('never lets a client strip or replace embedded data', async () => {
    const ref = doc(dbFor(OWNER), PATH);
    for (const key of LEGACY_KEYS) {
      await assertFails(updateDoc(ref, { [key]: deleteField(), updatedAt: serverTimestamp() }));
    }
    await assertFails(updateDoc(ref, { goals: [], updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { chats: [], updatedAt: serverTimestamp() }));
    // A whole-document overwrite (what the prototype's sync could do) is refused.
    await assertFails(setDoc(ref, { displayName: 'Eshaan', email: OWNER.email, updatedAt: serverTimestamp() }));
    // Removing a profile field is refused too.
    await assertFails(updateDoc(ref, { displayName: deleteField(), updatedAt: serverTimestamp() }));
    expectLegacyIntact(await stored());
  });

  it('refuses forged credits and plan changes', async () => {
    const ref = doc(dbFor(OWNER), PATH);
    await assertFails(updateDoc(ref, { creditsRemaining: 9999, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { subscriptionPlan: 'plus', updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(dbFor(OWNER), `${PATH}/private/account`), { creditsRemaining: 9999 }));
  });

  it('lets the owner keep editing rows the backend imported', async () => {
    // Same shape functions/src/legacy/importLegacy.ts writes.
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore() as unknown as Firestore;
      const at = Timestamp.fromMillis(1_759_400_000_000);
      await setDoc(doc(db, `${PATH}/goals/1759400000000`), { title: 'Run a 5k', category: 'fitness', status: 'active', progress: 40, createdAt: at, updatedAt: at });
      await setDoc(doc(db, `${PATH}/checkIns/2026-10-09`), { date: '2026-10-09', moods: ['tired'], happiness: 4, stress: 7, sleep: 5, reflection: 'Late night', createdAt: at, updatedAt: at });
      await setDoc(doc(db, `${PATH}/journal/1759932000000`), { date: '2026-10-07', text: 'Noted.', createdAt: at, updatedAt: at });
      await setDoc(doc(db, `${PATH}/conversations/legacy_c2`), {
        title: 'Reflection', mode: 'reflection', reflectionCheckInId: '2026-10-09', titleEdited: false,
        messageCount: 1, summaryMessageCount: 0, lastMessagePreview: 'Why was I so tired?', lastMessageAt: at, createdAt: at, updatedAt: at,
      });
    });
    const db = dbFor(OWNER);
    await assertSucceeds(updateDoc(doc(db, `${PATH}/goals/1759400000000`), { progress: 60, updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(db, `${PATH}/checkIns/2026-10-09`), { stress: 5, win: deleteField(), updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(db, `${PATH}/conversations/legacy_c2`), { title: 'Tired week', titleEdited: true, updatedAt: serverTimestamp() }));
    await assertFails(getDoc(doc(dbFor(OTHER), `${PATH}/journal/1759932000000`)));
  });
});
