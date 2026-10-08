import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

const ALICE = { uid: 'alice', email: 'alice@example.com' };
const BOB = { uid: 'bob', email: 'bob@example.com' };

function dbFor(user: { uid: string; email: string } | null): Firestore {
  const ctx = user ? env.authenticatedContext(user.uid, { email: user.email }) : env.unauthenticatedContext();
  return ctx.firestore() as unknown as Firestore;
}

function newProfile(email = ALICE.email) {
  return {
    schemaVersion: 2,
    displayName: 'Alice',
    email,
    dateOfBirth: null,
    profession: '',
    goalsSummary: '',
    income: '',
    lifestyle: '',
    struggles: '',
    coachNotes: '',
    onboardingCompleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore() as unknown as Firestore, path), data);
  });
}

async function seedAliceProfile() {
  await seed('users/alice', {
    ...newProfile(),
    createdAt: Timestamp.fromMillis(1_700_000_000_000),
    updatedAt: Timestamp.fromMillis(1_700_000_000_000),
  });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-byt',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
});

afterAll(async () => {
  await env.cleanup();
});

describe('profile users/{uid}', () => {
  it('lets the owner create a valid profile', async () => {
    await assertSucceeds(setDoc(doc(dbFor(ALICE), 'users/alice'), newProfile()));
  });

  it('rejects creating another user’s profile', async () => {
    await assertFails(setDoc(doc(dbFor(BOB), 'users/alice'), newProfile(BOB.email)));
  });

  it('rejects unknown fields such as credits on create', async () => {
    await assertFails(setDoc(doc(dbFor(ALICE), 'users/alice'), { ...newProfile(), creditsRemaining: 9999 }));
  });

  it('rejects missing fields, a mismatched email, and client-chosen timestamps', async () => {
    const { coachNotes: _omit, ...partial } = newProfile();
    await assertFails(setDoc(doc(dbFor(ALICE), 'users/alice'), partial));
    await assertFails(setDoc(doc(dbFor(ALICE), 'users/alice'), newProfile('someone@else.com')));
    await assertFails(
      setDoc(doc(dbFor(ALICE), 'users/alice'), { ...newProfile(), createdAt: Timestamp.fromMillis(0) })
    );
  });

  it('only lets the owner read', async () => {
    await seedAliceProfile();
    await assertSucceeds(getDoc(doc(dbFor(ALICE), 'users/alice')));
    await assertFails(getDoc(doc(dbFor(BOB), 'users/alice')));
    await assertFails(getDoc(doc(dbFor(null), 'users/alice')));
    await assertFails(getDocs(collection(dbFor(ALICE), 'users')));
  });

  it('allows valid field updates by the owner', async () => {
    await seedAliceProfile();
    await assertSucceeds(
      updateDoc(doc(dbFor(ALICE), 'users/alice'), {
        displayName: 'Alice B',
        dateOfBirth: '2000-01-02',
        goalsSummary: 'Ship BYT',
        onboardingCompleted: true,
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('rejects invalid updates', async () => {
    await seedAliceProfile();
    const ref = doc(dbFor(ALICE), 'users/alice');
    await assertFails(updateDoc(ref, { displayName: '', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { coachNotes: 'x'.repeat(2001), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { dateOfBirth: '02/01/2000', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { creditsRemaining: 500, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { plan: 'plus', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { profession: 'Chef' }));
    await assertFails(updateDoc(ref, { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { email: 'new@example.com', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(dbFor(BOB), 'users/alice'), { profession: 'Chef', updatedAt: serverTimestamp() }));
  });

  it('never lets clients delete a profile', async () => {
    await seedAliceProfile();
    await assertFails(deleteDoc(doc(dbFor(ALICE), 'users/alice')));
  });

  it('allows the additive upgrade of a prototype-era document and keeps legacy data', async () => {
    await seed('users/alice', {
      displayName: 'Alice',
      email: ALICE.email,
      onboardingCompleted: true,
      coachProfile: { profession: 'Designer' },
      goals: [{ id: '1', title: 'Old goal' }],
      chats: [],
      creditsRemaining: 120,
      updatedAt: Timestamp.fromMillis(1_700_000_000_000),
    });
    const ref = doc(dbFor(ALICE), 'users/alice');
    await assertSucceeds(
      updateDoc(ref, {
        schemaVersion: 2,
        displayName: 'Alice',
        email: ALICE.email,
        dateOfBirth: null,
        profession: 'Designer',
        goalsSummary: '',
        income: '',
        lifestyle: '',
        struggles: '',
        coachNotes: '',
        onboardingCompleted: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
    // Clients still cannot touch legacy credit fields.
    await assertFails(updateDoc(ref, { creditsRemaining: 999, updatedAt: serverTimestamp() }));
  });
});

describe('subcollections', () => {
  beforeEach(seedAliceProfile);

  const stamps = () => ({ createdAt: serverTimestamp(), updatedAt: serverTimestamp() });

  it('goals: owner-only, validated', async () => {
    const goal = { title: 'Run a 10k', category: 'health', status: 'active', progress: 10, ...stamps() };
    await assertSucceeds(setDoc(doc(dbFor(ALICE), 'users/alice/goals/g1'), goal));
    await assertFails(setDoc(doc(dbFor(BOB), 'users/alice/goals/g2'), goal));
    await assertFails(setDoc(doc(dbFor(ALICE), 'users/alice/goals/g3'), { ...goal, progress: 150 }));
    await assertFails(setDoc(doc(dbFor(ALICE), 'users/alice/goals/g4'), { ...goal, status: 'done' }));
    await assertFails(setDoc(doc(dbFor(ALICE), 'users/alice/goals/g5'), { ...goal, title: '' }));
    await assertFails(getDoc(doc(dbFor(BOB), 'users/alice/goals/g1')));
    await assertSucceeds(deleteDoc(doc(dbFor(ALICE), 'users/alice/goals/g1')));
  });

  it('check-ins: one per date id, known moods, sliders 1–10', async () => {
    const checkIn = { date: '2026-10-04', moods: ['energized', 'focused'], happiness: 7, stress: 3, sleep: 8, ...stamps() };
    await assertSucceeds(setDoc(doc(dbFor(ALICE), 'users/alice/checkIns/2026-10-04'), checkIn));
    await assertSucceeds(
      setDoc(doc(dbFor(ALICE), 'users/alice/checkIns/2026-10-03'), {
        ...checkIn,
        date: '2026-10-03',
        reflection: 'ok',
        win: 'Walk',
      })
    );
    await assertFails(setDoc(doc(dbFor(ALICE), 'users/alice/checkIns/2026-10-05'), checkIn));
    await assertFails(
      setDoc(doc(dbFor(ALICE), 'users/alice/checkIns/2026-10-06'), { ...checkIn, date: '2026-10-06', happiness: 11 })
    );
    await assertFails(
      setDoc(doc(dbFor(ALICE), 'users/alice/checkIns/2026-10-07'), { ...checkIn, date: '2026-10-07', moods: [] })
    );
    await assertFails(
      setDoc(doc(dbFor(ALICE), 'users/alice/checkIns/2026-10-08'), { ...checkIn, date: '2026-10-08', moods: ['ecstatic'] })
    );
    await assertFails(
      setDoc(doc(dbFor(ALICE), 'users/alice/checkIns/today'), { ...checkIn, date: 'today' })
    );
  });

  it('updates keep createdAt; re-creating an existing check-in is rejected', async () => {
    const ref = doc(dbFor(ALICE), 'users/alice/checkIns/2026-10-04');
    await assertSucceeds(
      setDoc(ref, { date: '2026-10-04', moods: ['calm'], happiness: 5, stress: 5, sleep: 5, win: 'hi', ...stamps() })
    );
    await assertSucceeds(updateDoc(ref, { happiness: 9, win: deleteField(), updatedAt: serverTimestamp() }));
    await assertFails(setDoc(ref, { date: '2026-10-04', moods: ['calm'], happiness: 4, stress: 3, sleep: 3, ...stamps() }));
    await assertFails(updateDoc(ref, { happiness: 4 }));

    const goal = doc(dbFor(ALICE), 'users/alice/goals/g1');
    await assertSucceeds(setDoc(goal, { title: 'Run', category: 'health', status: 'active', progress: 0, ...stamps() }));
    await assertSucceeds(updateDoc(goal, { progress: 60, status: 'paused', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(goal, { progress: 60.5, updatedAt: serverTimestamp() }));

    const entry = doc(dbFor(ALICE), 'users/alice/journal/j1');
    await assertSucceeds(setDoc(entry, { date: '2026-10-04', text: 'First', ...stamps() }));
    await assertSucceeds(updateDoc(entry, { text: 'Edited', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(entry, { text: '', updatedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(entry));
  });

  it('owner can list their own collections but not someone else’s', async () => {
    await seed('users/alice/goals/g1', { title: 'x' });
    await assertSucceeds(getDocs(collection(dbFor(ALICE), 'users/alice/goals')));
    await assertFails(getDocs(collection(dbFor(BOB), 'users/alice/goals')));
    await assertFails(getDocs(collection(dbFor(null), 'users/alice/journal')));
  });

  it('journal: text required', async () => {
    const entry = { date: '2026-10-04', text: 'Felt clear today.', ...stamps() };
    await assertSucceeds(setDoc(doc(dbFor(ALICE), 'users/alice/journal/j1'), entry));
    await assertFails(setDoc(doc(dbFor(ALICE), 'users/alice/journal/j2'), { ...entry, text: '' }));
    await assertFails(setDoc(doc(dbFor(BOB), 'users/alice/journal/j3'), entry));
  });

  it('conversations: clients rename only; summaries are server-owned', async () => {
    const ref = doc(dbFor(ALICE), 'users/alice/conversations/c1');
    await assertSucceeds(setDoc(ref, { title: 'First chat', mode: 'normal', titleEdited: false, ...stamps() }));
    await assertSucceeds(updateDoc(ref, { title: 'Renamed', titleEdited: true, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { summary: 'injected', updatedAt: serverTimestamp() }));
    await assertFails(
      setDoc(doc(dbFor(ALICE), 'users/alice/conversations/c2'), { title: 'x', mode: 'normal', summary: 's', ...stamps() })
    );
  });

  it('messages: only the backend can write them; the owner can read', async () => {
    await seed('users/alice/conversations/c1', { title: 'Chat', mode: 'normal' });
    await seed('users/alice/conversations/c1/messages/m1', { role: 'coach', text: 'Hi', clientTurnId: 't1' });
    const userMsg = { role: 'user', text: 'Hi', clientTurnId: 't1', createdAt: serverTimestamp() };
    await assertFails(setDoc(doc(dbFor(ALICE), 'users/alice/conversations/c1/messages/m2'), userMsg));
    await assertFails(updateDoc(doc(dbFor(ALICE), 'users/alice/conversations/c1/messages/m1'), { text: 'edited' }));
    await assertSucceeds(getDoc(doc(dbFor(ALICE), 'users/alice/conversations/c1/messages/m1')));
    await assertFails(getDoc(doc(dbFor(BOB), 'users/alice/conversations/c1/messages/m1')));
  });

  it('private/account and turns are read-only for the owner', async () => {
    await seed('users/alice/private/account', { plan: 'standard', creditsRemaining: 150 });
    await seed('users/alice/turns/t1', { status: 'completed', creditCharged: true });
    await assertSucceeds(getDoc(doc(dbFor(ALICE), 'users/alice/private/account')));
    await assertFails(getDoc(doc(dbFor(BOB), 'users/alice/private/account')));
    await assertFails(updateDoc(doc(dbFor(ALICE), 'users/alice/private/account'), { creditsRemaining: 9999 }));
    await assertFails(setDoc(doc(dbFor(ALICE), 'users/alice/private/other'), { plan: 'plus' }));
    await assertSucceeds(getDoc(doc(dbFor(ALICE), 'users/alice/turns/t1')));
    await assertFails(setDoc(doc(dbFor(ALICE), 'users/alice/turns/t2'), { status: 'completed' }));
  });

  it('denies everything outside users/{uid}', async () => {
    await assertFails(setDoc(doc(dbFor(ALICE), 'config/app'), { x: 1 }));
    await assertFails(getDoc(doc(dbFor(ALICE), 'config/app')));
    await assertFails(setDoc(doc(dbFor(ALICE), 'users/alice/unknown/x'), { x: 1 }));
  });
});
