import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { handleCoachTurn, handleGetAccount, type TurnDeps } from '../../src/turn/handlers.js';
import { MockLlm } from '../../src/llm/mock.js';
import { MockVoice } from '../../src/voice/mock.js';

/** Prototype accounts (everything on users/{uid}) against the Firestore emulator. */

const NOW = Date.UTC(2026, 9, 22, 12);

// Shared with the app's rules tests (tests/fixtures), shaped like a real prototype account.
const legacyUser = JSON.parse(readFileSync(resolve(__dirname, '../../../tests/fixtures/legacy-user.json'), 'utf8')) as Record<string, unknown>;

function db(): Firestore {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('FIRESTORE_EMULATOR_HOST is not set. Run npm run test:emulator.');
  }
  const app = getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-byt' });
  return getFirestore(app);
}

function deps(firestore: Firestore): TurnDeps {
  return {
    db: firestore,
    llm: () => new MockLlm(),
    voice: () => new MockVoice(),
    now: () => NOW,
    log: () => undefined,
    engineOptions: { models: { reply: 'mock-coach', analysis: 'mock-coach', summary: 'mock-coach' } },
  };
}

let firestore: Firestore;
let n = 0;
const uid = () => `legacy-${++n}`;

async function seed(user: string) {
  await firestore.doc(`users/${user}`).set({ ...legacyUser, updatedAt: Timestamp.fromMillis(NOW - 86_400_000) });
}

const ids = async (path: string) => (await firestore.collection(path).get()).docs.map((d) => d.id).sort();

beforeAll(() => {
  firestore = db();
});

beforeEach(async () => {
  const users = await firestore.collection('users').listDocuments();
  await Promise.all(users.map((doc) => firestore.recursiveDelete(doc)));
});

describe('legacy import', () => {
  it('copies goals, check-ins, journal and chats with the ids the app shows, and leaves users/{uid} untouched', async () => {
    const user = uid();
    await seed(user);
    const before = (await firestore.doc(`users/${user}`).get()).data();

    const account = await handleGetAccount(deps(firestore), { uid: user }, { timeZone: 'Europe/London' });
    expect(account.legacyImported).toBe(true);
    expect(account.creditsRemaining).toBe(150);

    expect((await firestore.doc(`users/${user}`).get()).data()).toEqual(before);

    expect(await ids(`users/${user}/goals`)).toEqual(['1759400000000', '1759500000000', 'legacy_g_3']);
    const goal = (await firestore.doc(`users/${user}/goals/legacy_g_3`).get()).data();
    expect(Object.keys(goal ?? {}).sort()).toEqual(['category', 'createdAt', 'progress', 'status', 'title', 'updatedAt']);
    expect(goal).toMatchObject({ title: 'Apply to university', category: 'career', status: 'paused', progress: 10 });

    // 23:30 UTC on 8 Oct is 00:30 on 9 Oct in London.
    expect(await ids(`users/${user}/checkIns`)).toEqual(['2026-10-07', '2026-10-09']);
    const late = (await firestore.doc(`users/${user}/checkIns/2026-10-09`).get()).data();
    expect(late).toMatchObject({ date: '2026-10-09', moods: ['tired'], happiness: 4, stress: 7, sleep: 5, reflection: 'Late night' });
    expect(late).not.toHaveProperty('win');

    expect(await ids(`users/${user}/journal`)).toEqual(['1759932000000']);

    // The empty placeholder chat is skipped; a short id is made callable-safe.
    expect(await ids(`users/${user}/conversations`)).toEqual(['1759940000000', 'legacy_c2']);
    const monday = (await firestore.doc(`users/${user}/conversations/1759940000000`).get()).data();
    expect(monday).toMatchObject({ title: 'Monday', mode: 'normal', titleEdited: true, messageCount: 2, lastMessagePreview: 'Hi there. What is on your mind?' });
    const reflection = (await firestore.doc(`users/${user}/conversations/legacy_c2`).get()).data();
    expect(reflection).toMatchObject({ mode: 'reflection', reflectionCheckInId: '2026-10-09' });
    const messages = await firestore.collection(`users/${user}/conversations/1759940000000/messages`).orderBy('createdAt').get();
    expect(messages.docs.map((d) => [d.id, d.data().role, d.data().text])).toEqual([
      ['1759940000001', 'user', 'Hello'],
      ['1759940000002', 'coach', 'Hi there. What is on your mind?'],
    ]);
  });

  it('runs once: rows deleted afterwards stay deleted', async () => {
    const user = uid();
    await seed(user);
    await handleGetAccount(deps(firestore), { uid: user }, {});
    await firestore.doc(`users/${user}/goals/1759400000000`).delete();
    const again = await handleGetAccount(deps(firestore), { uid: user }, {});
    expect(again.legacyImported).toBe(true);
    expect(await ids(`users/${user}/goals`)).toEqual(['1759500000000', 'legacy_g_3']);
  });

  it('never overwrites a document that already exists', async () => {
    const user = uid();
    await seed(user);
    await firestore.doc(`users/${user}/goals/1759400000000`).set({ title: 'Run a 10k', category: 'fitness', status: 'active', progress: 70, createdAt: new Date(NOW), updatedAt: new Date(NOW) });
    await handleGetAccount(deps(firestore), { uid: user }, {});
    expect((await firestore.doc(`users/${user}/goals/1759400000000`).get()).data()).toMatchObject({ title: 'Run a 10k', progress: 70 });
    const marker = (await firestore.doc(`users/${user}/private/account`).get()).data()?.legacyImport;
    expect(marker).toMatchObject({ version: 1, skipped: 1 });
  });

  it('marks a new account without writing anything else', async () => {
    const user = uid();
    await firestore.doc(`users/${user}`).set({ schemaVersion: 2, displayName: 'New', email: 'new@example.com' });
    const account = await handleGetAccount(deps(firestore), { uid: user }, undefined);
    expect(account.legacyImported).toBe(true);
    expect(await ids(`users/${user}/goals`)).toEqual([]);
    expect(await ids(`users/${user}/conversations`)).toEqual([]);
  });

  it('lets an imported chat continue with the coach', async () => {
    const user = uid();
    await seed(user);
    await handleGetAccount(deps(firestore), { uid: user }, {});
    const result = await handleCoachTurn(deps(firestore), { uid: user }, {
      requestId: 'req-legacy-0001',
      conversationId: '1759940000000',
      kind: 'message',
      text: 'I keep putting off applying for university.',
      mode: 'normal',
    });
    expect(result.credits).toMatchObject({ remaining: 149, charged: 1 });
    const conv = (await firestore.doc(`users/${user}/conversations/1759940000000`).get()).data();
    expect(conv?.messageCount).toBe(4);
  });
});
