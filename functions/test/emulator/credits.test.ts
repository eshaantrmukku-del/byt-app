import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { MONTHLY_ALLOWANCE } from '../../src/config.js';
import { CoachError } from '../../src/errors.js';
import { handleCoachTurn, handleVoiceTurn, type TurnDeps } from '../../src/turn/handlers.js';
import { MockLlm } from '../../src/llm/mock.js';
import { MockVoice } from '../../src/voice/deepgram.js';

/**
 * These tests talk to the Firestore emulator (FIRESTORE_EMULATOR_HOST), never production.
 * They exercise the same handlers the callables use, so auth, charging, idempotency
 * and refunds are the real transactions.
 */

const NOW = Date.UTC(2026, 9, 8, 12);

function db(): Firestore {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('FIRESTORE_EMULATOR_HOST is not set. Run npm run test:emulator.');
  }
  const app = getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-byt' });
  return getFirestore(app);
}

function deps(firestore: Firestore, over: Partial<TurnDeps> = {}): TurnDeps {
  return {
    db: firestore,
    llm: () => new MockLlm(),
    voice: () => new MockVoice(),
    now: () => NOW,
    log: () => undefined,
    engineOptions: { models: { reply: 'mock-coach', analysis: 'mock-coach', summary: 'mock-coach' } },
    ...over,
  };
}

let firestore: Firestore;
let n = 0;
const uid = () => `user-${++n}`;
const requestId = () => `req${String(++n).padStart(10, '0')}`;

async function conversation(user: string, id = 'conv0001', extra: Record<string, unknown> = {}) {
  await firestore.doc(`users/${user}/conversations/${id}`).set({
    title: 'Coaching session',
    mode: 'normal',
    titleEdited: false,
    messageCount: 0,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
    ...extra,
  });
  return id;
}

function message(user: string, conversationId: string, text = 'I keep putting off applying for university.') {
  return {
    requestId: requestId(),
    conversationId,
    kind: 'message' as const,
    text,
    mode: 'normal' as const,
  };
}

beforeAll(() => {
  firestore = db();
});

beforeEach(async () => {
  const users = await firestore.collection('users').listDocuments();
  await Promise.all(users.map((doc) => firestore.recursiveDelete(doc)));
});

describe('auth', () => {
  it('rejects a turn with no signed-in user and writes nothing', async () => {
    await expect(handleCoachTurn(deps(firestore), { uid: undefined }, message('nobody', 'c'))).rejects.toMatchObject({ reason: 'unauthenticated' });
    expect((await firestore.collection('users').listDocuments()).length).toBe(0);
  });
});

describe('credits', () => {
  it('charges one credit, stores both messages, and replays the same request for free', async () => {
    const user = uid();
    const conversationId = await conversation(user);
    const body = message(user, conversationId);
    const first = await handleCoachTurn(deps(firestore), { uid: user }, body);
    const second = await handleCoachTurn(deps(firestore), { uid: user }, body);

    expect(first.credits).toEqual({ remaining: 149, periodKey: '2026-10', charged: 1 });
    expect(first.replayed).toBe(false);
    expect(first.userMessage?.id).toBe(body.requestId);
    expect(first.reply.id).toBe(`${body.requestId}_reply`);
    expect(second.replayed).toBe(true);
    expect(second.credits.charged).toBe(0);
    expect(second.credits.remaining).toBe(149);
    expect(second.reply.text).toBe(first.reply.text);

    const account = (await firestore.doc(`users/${user}/private/account`).get()).data();
    expect(account?.creditsRemaining).toBe(149);
    const messages = await firestore.collection(`users/${user}/conversations/${conversationId}/messages`).get();
    expect(messages.docs.map((doc) => doc.id).sort()).toEqual([body.requestId, `${body.requestId}_reply`].sort());
  });

  it('does not charge a session opener, and does not store a user message', async () => {
    const user = uid();
    const conversationId = await conversation(user);
    const result = await handleCoachTurn(deps(firestore), { uid: user }, {
      requestId: `opener_${conversationId}`.slice(0, 64),
      conversationId,
      kind: 'opener',
      mode: 'normal',
    });
    expect(result.userMessage).toBeNull();
    expect(result.credits.charged).toBe(0);
    expect(result.credits.remaining).toBe(MONTHLY_ALLOWANCE.standard);
    expect(result.reply.text.length).toBeGreaterThan(0);
  });

  it('refunds a provider failure and charges exactly once when the same request is retried', async () => {
    const user = uid();
    const conversationId = await conversation(user);
    const body = message(user, conversationId);
    const failing = deps(firestore, { llm: () => new MockLlm({ failPurposes: ['reply'] }) });
    await expect(handleCoachTurn(failing, { uid: user }, body)).rejects.toMatchObject({ reason: 'provider-unavailable' });
    expect((await firestore.doc(`users/${user}/private/account`).get()).data()?.creditsRemaining).toBe(150);
    expect((await firestore.doc(`users/${user}/turns/${body.requestId}`).get()).data()?.status).toBe('failed');

    const retried = await handleCoachTurn(deps(firestore), { uid: user }, body);
    expect(retried.replayed).toBe(false);
    expect(retried.credits).toMatchObject({ remaining: 149, charged: 1 });
  });

  it('never lets concurrent turns spend more credits than the balance', async () => {
    const user = uid();
    const conversationId = await conversation(user);
    await firestore.doc(`users/${user}/private/account`).set({
      plan: 'standard',
      betaTier: true,
      creditsRemaining: 3,
      creditsPeriodKey: '2026-10',
      monthlyAllowance: 150,
    });
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => handleCoachTurn(deps(firestore), { uid: user }, message(user, conversationId))),
    );
    const ok = results.filter((result) => result.status === 'fulfilled');
    const denied = results.filter((result) => result.status === 'rejected');
    expect(ok).toHaveLength(3);
    expect(denied).toHaveLength(5);
    for (const result of denied) {
      expect((result as PromiseRejectedResult).reason).toBeInstanceOf(CoachError);
      expect((result as PromiseRejectedResult).reason.reason).toBe('no-credits');
    }
    expect((await firestore.doc(`users/${user}/private/account`).get()).data()?.creditsRemaining).toBe(0);
  });

  it('charges a duplicated in-flight request only once', async () => {
    const user = uid();
    const conversationId = await conversation(user);
    const body = message(user, conversationId);
    const results = await Promise.allSettled([
      handleCoachTurn(deps(firestore), { uid: user }, body),
      handleCoachTurn(deps(firestore), { uid: user }, body),
    ]);
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    expect((await firestore.doc(`users/${user}/private/account`).get()).data()?.creditsRemaining).toBe(149);
  });

  it('resets a spent previous month before charging', async () => {
    const user = uid();
    const conversationId = await conversation(user);
    await firestore.doc(`users/${user}/private/account`).set({
      plan: 'plus',
      betaTier: true,
      creditsRemaining: 0,
      creditsPeriodKey: '2026-09',
      monthlyAllowance: 150,
    });
    const result = await handleCoachTurn(deps(firestore), { uid: user }, message(user, conversationId));
    expect(result.credits).toMatchObject({ remaining: 149, periodKey: '2026-10', charged: 1 });
    expect((await firestore.doc(`users/${user}/private/account`).get()).data()?.plan).toBe('plus');
  });

  it('rejects a missing conversation before creating an account', async () => {
    const user = uid();
    await expect(
      handleCoachTurn(deps(firestore), { uid: user }, message(user, 'missing0001')),
    ).rejects.toMatchObject({ reason: 'conversation-not-found' });
    expect((await firestore.doc(`users/${user}/private/account`).get()).exists).toBe(false);
  });

  it('rate-limits the ninth turn inside a minute', async () => {
    const user = uid();
    const conversationId = await conversation(user);
    const clock = deps(firestore);
    for (let i = 0; i < 8; i++) {
      await handleCoachTurn(clock, { uid: user }, message(user, conversationId, `message number ${i} is about work`));
    }
    await expect(handleCoachTurn(clock, { uid: user }, message(user, conversationId))).rejects.toMatchObject({ reason: 'rate-limited' });
    expect((await firestore.doc(`users/${user}/private/account`).get()).data()?.creditsRemaining).toBe(142);
  });
});

describe('voice', () => {
  function audio(text: string) {
    return {
      base64: Buffer.from(text.padEnd(80, ' ')).toString('base64'),
      mimeType: 'audio/m4a' as const,
      durationMs: 2000,
    };
  }

  it('transcribes, coaches and speaks, charging one credit', async () => {
    const user = uid();
    const conversationId = await conversation(user);
    const request = requestId();
    const result = await handleVoiceTurn(deps(firestore), { uid: user }, {
      requestId: request,
      conversationId,
      mode: 'normal',
      audio: audio('I keep putting off the application'),
    });
    expect(result.transcript).toContain('putting off');
    expect(result.userMessage?.text).toContain('putting off');
    expect(result.replyAudio?.mimeType).toBe('audio/mpeg');
    expect(result.credits.charged).toBe(1);
    expect(result.credits.remaining).toBe(149);
  });

  it('refunds a silent recording and a speech-to-text failure', async () => {
    const user = uid();
    const conversationId = await conversation(user);
    await expect(
      handleVoiceTurn(deps(firestore), { uid: user }, {
        requestId: requestId(),
        conversationId,
        mode: 'normal',
        audio: audio('SILENCE'),
      }),
    ).rejects.toMatchObject({ reason: 'no-speech' });

    await expect(
      handleVoiceTurn(deps(firestore, { voice: () => new MockVoice({ failStt: true }) }), { uid: user }, {
        requestId: requestId(),
        conversationId,
        mode: 'normal',
        audio: audio('hello there friend'),
      }),
    ).rejects.toMatchObject({ reason: 'provider-unavailable' });

    expect((await firestore.doc(`users/${user}/private/account`).get()).data()?.creditsRemaining).toBe(150);
  });

  it('keeps the text reply when speech synthesis fails, and still charges', async () => {
    const user = uid();
    const conversationId = await conversation(user);
    const result = await handleVoiceTurn(deps(firestore, { voice: () => new MockVoice({ failTts: true }) }), { uid: user }, {
      requestId: requestId(),
      conversationId,
      mode: 'normal',
      audio: audio('I feel stuck at work today'),
    });
    expect(result.reply.text.length).toBeGreaterThan(0);
    expect(result.replyAudio).toBeNull();
    expect(result.credits.remaining).toBe(149);
  });
});
