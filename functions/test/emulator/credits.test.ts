import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DAILY_TOKEN_LIMIT, TOKEN_RESERVE } from '../../src/config.js';
import { CoachError } from '../../src/errors.js';
import { handleCoachTurn, handleVoiceAudio, handleVoiceTurn, type TurnDeps } from '../../src/turn/handlers.js';
import type { LlmClient, LlmRequest } from '../../src/llm/types.js';
import { voiceParts } from '../../src/voice/parts.js';
import { MockLlm } from '../../src/llm/mock.js';
import { MockVoice } from '../../src/voice/mock.js';

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

const LIMIT = DAILY_TOKEN_LIMIT.standard;
const TODAY = '2026-10-08';

async function used(user: string): Promise<number> {
  return ((await firestore.doc(`users/${user}/private/account`).get()).data()?.tokensUsed as number | undefined) ?? 0;
}

async function turnTokens(user: string, id: string): Promise<number> {
  return ((await firestore.doc(`users/${user}/turns/${id}`).get()).data()?.tokens as number | undefined) ?? -1;
}

async function setUsed(user: string, tokensUsed: number, dayKey = TODAY, plan = 'standard') {
  await firestore.doc(`users/${user}/private/account`).set({ plan, betaTier: true, dayKey, tokensUsed, dailyTokenLimit: LIMIT });
}

describe('daily allowance', () => {
  it('counts the tokens a turn really used, stores both messages, and replays for free', async () => {
    const user = uid();
    const conversationId = await conversation(user);
    const body = message(user, conversationId);
    const first = await handleCoachTurn(deps(firestore), { uid: user }, body);
    const tokens = await turnTokens(user, body.requestId);
    expect(tokens).toBeGreaterThan(0);
    expect(await used(user)).toBe(tokens);
    expect(first.usage).toEqual({ used: tokens, limit: LIMIT, resetsAt: Date.UTC(2026, 9, 9), metered: true });
    expect(first.userMessage?.id).toBe(body.requestId);
    expect(first.reply.id).toBe(`${body.requestId}_reply`);

    const second = await handleCoachTurn(deps(firestore), { uid: user }, body);
    expect(second.replayed).toBe(true);
    expect(second.usage).toMatchObject({ used: tokens, metered: false });
    expect(second.reply.text).toBe(first.reply.text);
    expect(await used(user)).toBe(tokens);

    const messages = await firestore.collection(`users/${user}/conversations/${conversationId}/messages`).get();
    expect(messages.docs.map((doc) => doc.id).sort()).toEqual([body.requestId, `${body.requestId}_reply`].sort());
  });

  it('does not count a session opener, and does not store a user message', async () => {
    const user = uid();
    const conversationId = await conversation(user);
    const result = await handleCoachTurn(deps(firestore), { uid: user }, {
      requestId: `opener_${conversationId}`.slice(0, 64),
      conversationId,
      kind: 'opener',
      mode: 'normal',
    });
    expect(result.userMessage).toBeNull();
    expect(result.usage).toMatchObject({ used: 0, metered: false });
    expect(result.reply.text.length).toBeGreaterThan(0);
    expect(await used(user)).toBe(0);
  });

  it('releases the reservation on a provider failure and counts a retry once', async () => {
    const user = uid();
    const conversationId = await conversation(user);
    const body = message(user, conversationId);
    const failing = deps(firestore, { llm: () => new MockLlm({ failPurposes: ['reply'] }) });
    await expect(handleCoachTurn(failing, { uid: user }, body)).rejects.toMatchObject({ reason: 'provider-unavailable' });
    expect(await used(user)).toBe(0);
    expect((await firestore.doc(`users/${user}/turns/${body.requestId}`).get()).data()).toMatchObject({ status: 'failed', reserved: 0 });

    const retried = await handleCoachTurn(deps(firestore), { uid: user }, body);
    expect(retried.replayed).toBe(false);
    expect(await used(user)).toBe(await turnTokens(user, body.requestId));
  });

  it('stops new turns once today is used up, and says when it resets', async () => {
    const user = uid();
    const conversationId = await conversation(user);
    await setUsed(user, LIMIT);
    await expect(handleCoachTurn(deps(firestore), { uid: user }, message(user, conversationId))).rejects.toMatchObject({
      reason: 'no-credits',
      extra: { resetsAt: Date.UTC(2026, 9, 9) },
    });
    expect(await used(user)).toBe(LIMIT);
  });

  it('never lets parallel sends run past the limit by more than one turn', async () => {
    const user = uid();
    const conversationId = await conversation(user);
    await setUsed(user, LIMIT - 1);
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => handleCoachTurn(deps(firestore), { uid: user }, message(user, conversationId))),
    );
    const ok = results.filter((result) => result.status === 'fulfilled');
    const denied = results.filter((result) => result.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(denied).toHaveLength(7);
    for (const result of denied) {
      expect((result as PromiseRejectedResult).reason).toBeInstanceOf(CoachError);
      expect((result as PromiseRejectedResult).reason.reason).toBe('no-credits');
    }
    const id = (ok[0] as PromiseFulfilledResult<{ requestId: string }>).value.requestId;
    expect(await used(user)).toBe(LIMIT - 1 + (await turnTokens(user, id)));
  });

  it('counts a duplicated in-flight request only once', async () => {
    const user = uid();
    const conversationId = await conversation(user);
    const body = message(user, conversationId);
    const results = await Promise.allSettled([
      handleCoachTurn(deps(firestore), { uid: user }, body),
      handleCoachTurn(deps(firestore), { uid: user }, body),
    ]);
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    expect(await used(user)).toBe(await turnTokens(user, body.requestId));
  });

  it('starts a new day from zero and keeps the plan', async () => {
    const user = uid();
    const conversationId = await conversation(user);
    await setUsed(user, LIMIT, '2026-10-07', 'plus');
    const body = message(user, conversationId);
    const result = await handleCoachTurn(deps(firestore), { uid: user }, body);
    expect(result.usage.used).toBe(await turnTokens(user, body.requestId));
    expect((await firestore.doc(`users/${user}/private/account`).get()).data()).toMatchObject({ plan: 'plus', dayKey: TODAY });
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
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) {
      const body = message(user, conversationId, `message number ${i} is about work`);
      ids.push(body.requestId);
      await handleCoachTurn(clock, { uid: user }, body);
    }
    await expect(handleCoachTurn(clock, { uid: user }, message(user, conversationId))).rejects.toMatchObject({ reason: 'rate-limited' });
    const total = (await Promise.all(ids.map((id) => turnTokens(user, id)))).reduce((a, b) => a + b, 0);
    expect(await used(user)).toBe(total);
  });

  it('thinks as hard as the user chose, with standard as the default', async () => {
    const user = uid();
    const conversationId = await conversation(user);
    const llm = new MockLlm();
    const tracked = deps(firestore, { llm: () => llm });
    await handleCoachTurn(tracked, { uid: user }, message(user, conversationId));
    await handleCoachTurn(tracked, { uid: user }, { ...message(user, conversationId, 'Help me think about my career.'), thinking: 'deepest' });
    const replies = llm.calls.filter((call) => call.purpose === 'reply');
    expect(replies.map((call) => call.thinking)).toEqual(['low', 'high']);
    expect(replies[1]!.timeoutMs).toBeGreaterThan(replies[0]!.timeoutMs);
    await expect(handleCoachTurn(tracked, { uid: user }, { ...message(user, conversationId), thinking: 'turbo' })).rejects.toMatchObject({ reason: 'invalid-request' });
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

  /** A coach whose voice reply has three sentences, so it is spoken in two parts. */
  const REPLY = 'It sounds like part of you really wants this, and part of you is holding back. That tension makes sense when something matters to you. What is the part that is holding back most afraid of?';
  class ScriptedLlm implements LlmClient {
    readonly name = 'scripted';
    async generate(req: LlmRequest) {
      if (req.purpose !== 'reply') throw Object.assign(new Error('no analysis'), { kind: 'server' });
      return { text: JSON.stringify({ reply: REPLY, goalProgress: null }), model: req.model, latencyMs: 1, inputTokens: 1000, outputTokens: 100 };
    }
  }

  const spoken = (base64: string | undefined) => Buffer.from(base64 ?? '', 'base64').toString('utf8').replace(/^MOCK-WAV:/, '');

  it('transcribes, coaches, and speaks the first part straight away; the rest comes from voiceAudio', async () => {
    const user = uid();
    const conversationId = await conversation(user);
    const request = requestId();
    const voiceDeps = deps(firestore, { llm: () => new ScriptedLlm() });
    const result = await handleVoiceTurn(voiceDeps, { uid: user }, {
      requestId: request,
      conversationId,
      mode: 'normal',
      audio: audio('I keep putting off the application'),
    });
    const parts = voiceParts(REPLY);
    expect(parts).toHaveLength(2);
    expect(result.transcript).toContain('putting off');
    expect(result.userMessage?.text).toContain('putting off');
    expect(result.reply.text).toBe(REPLY);
    expect(result.audioParts).toBe(2);
    expect(result.replyAudio?.mimeType).toBe('audio/wav');
    expect(spoken(result.replyAudio?.base64)).toBe(parts[0]);
    expect(result.usage.metered).toBe(true);

    // Speech-to-text (200) + engine + the first spoken part are all counted.
    const afterFirst = await used(user);
    expect(afterFirst).toBe((await turnTokens(user, request)) + Math.ceil(parts[0]!.length / 2));
    expect(await turnTokens(user, request)).toBe(1100 + 200);

    const second = await handleVoiceAudio(voiceDeps, { uid: user }, { requestId: request, part: 1 });
    expect(spoken(second.replyAudio?.base64)).toBe(parts[1]);
    expect(await used(user)).toBe(afterFirst + Math.ceil(parts[1]!.length / 2));
  });

  it('serves later parts only for the owner’s finished voice turns, and not endlessly', async () => {
    const user = uid();
    const conversationId = await conversation(user);
    const request = requestId();
    const voiceDeps = deps(firestore, { llm: () => new ScriptedLlm() });
    await handleVoiceTurn(voiceDeps, { uid: user }, { requestId: request, conversationId, mode: 'normal', audio: audio('hello coach') });

    await expect(handleVoiceAudio(voiceDeps, { uid: 'someone-else' }, { requestId: request, part: 1 })).rejects.toMatchObject({ reason: 'invalid-request' });
    await expect(handleVoiceAudio(voiceDeps, { uid: undefined }, { requestId: request, part: 1 })).rejects.toMatchObject({ reason: 'unauthenticated' });
    await expect(handleVoiceAudio(voiceDeps, { uid: user }, { requestId: request, part: 2 })).rejects.toMatchObject({ reason: 'invalid-request' });
    for (let i = 0; i < 3; i++) await handleVoiceAudio(voiceDeps, { uid: user }, { requestId: request, part: 1 });
    await expect(handleVoiceAudio(voiceDeps, { uid: user }, { requestId: request, part: 1 })).rejects.toMatchObject({ reason: 'invalid-request' });

    const text = message(user, conversationId);
    await handleCoachTurn(deps(firestore), { uid: user }, text);
    await expect(handleVoiceAudio(voiceDeps, { uid: user }, { requestId: text.requestId, part: 1 })).rejects.toMatchObject({ reason: 'invalid-request' });
  });

  it('releases the reservation for a silent recording and a speech-to-text failure', async () => {
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

    expect(await used(user)).toBe(0);
  });

  it('keeps the text reply when speech synthesis fails, and still counts the turn', async () => {
    const user = uid();
    const conversationId = await conversation(user);
    const request = requestId();
    const result = await handleVoiceTurn(deps(firestore, { voice: () => new MockVoice({ failTts: true }) }), { uid: user }, {
      requestId: request,
      conversationId,
      mode: 'normal',
      audio: audio('I feel stuck at work today'),
    });
    expect(result.reply.text.length).toBeGreaterThan(0);
    expect(result.replyAudio).toBeNull();
    expect(result.audioParts).toBe(0);
    expect(await used(user)).toBe(await turnTokens(user, request));
    expect(TOKEN_RESERVE).toBeGreaterThan(0);
  });
});

describe('coach memory', () => {
  it('remembers a commitment in one conversation and closes it when they report back in the next', async () => {
    const user = uid();
    const first = await conversation(user, 'conv0001');
    const commit = message(user, first, "I'll send two applications on Friday.");
    await handleCoachTurn(deps(firestore), { uid: user }, commit);
    const memory = (await firestore.doc(`users/${user}/private/coach`).get()).data();
    expect(memory?.commitments).toEqual([expect.objectContaining({ id: commit.requestId, when: 'on Friday', status: 'open', conversationId: first })]);

    const second = await conversation(user, 'conv0002');
    const result = await handleCoachTurn(deps(firestore), { uid: user }, message(user, second, 'Update: I sent both applications yesterday.'));
    expect(result.reply.text).toMatch(/persistence/);
    const after = (await firestore.doc(`users/${user}/private/coach`).get()).data();
    expect(after?.commitments).toEqual([expect.objectContaining({ id: commit.requestId, status: 'kept' })]);
  });

  it('asks how they want to be coached once, and keeps what they say', async () => {
    const user = uid();
    const conversationId = await conversation(user);
    await handleCoachTurn(deps(firestore), { uid: user }, { requestId: `opener_${conversationId}`, conversationId, kind: 'opener', mode: 'normal' });
    expect((await firestore.doc(`users/${user}/private/coach`).get()).data()?.allianceAskedAt).toBe(NOW);
    await handleCoachTurn(deps(firestore), { uid: user }, message(user, conversationId, 'Please be more direct with me.'));
    expect((await firestore.doc(`users/${user}/private/coach`).get()).data()?.alliance).toEqual(['be more direct with me']);
  });
});
