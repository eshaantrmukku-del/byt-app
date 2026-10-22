import { HttpsError } from 'firebase-functions/v2/https';
import { describe, expect, it } from 'vitest';

import { resolveAccount } from '../../src/credits/ledger.js';
import { DAILY_TOKEN_LIMIT } from '../../src/config.js';
import { checkRateLimit, dayKey, nextDayStart } from '../../src/credits/period.js';
import { CoachError, toHttpsError } from '../../src/errors.js';
import { MAX_AUDIO_PARTS, parseCoachTurnRequest, parseVoiceAudioRequest, parseVoiceTurnRequest } from '../../src/validation.js';
import { MOCK_SPOKEN_TRANSCRIPT, MockVoice } from '../../src/voice/mock.js';
import { voiceParts } from '../../src/voice/parts.js';

const OCT = Date.UTC(2026, 9, 4, 12);

describe('daily allowance', () => {
  it('uses UTC calendar days', () => {
    expect(dayKey(OCT)).toBe('2026-10-04');
    expect(dayKey(Date.UTC(2026, 11, 31, 23, 59))).toBe('2026-12-31');
    expect(nextDayStart(OCT)).toBe(Date.UTC(2026, 9, 5));
    expect(nextDayStart(Date.UTC(2026, 11, 31, 23, 59))).toBe(Date.UTC(2027, 0, 1));
  });

  it('creates a standard beta account with today’s allowance on first use', () => {
    const { account, changed } = resolveAccount(undefined, OCT);
    expect(changed).toBe(true);
    expect(account).toEqual({ plan: 'standard', betaTier: true, dayKey: '2026-10-04', tokensUsed: 0, dailyTokenLimit: DAILY_TOKEN_LIMIT.standard });
  });

  it('starts a monthly-credit account from zero tokens and keeps the plan', () => {
    const { account, changed } = resolveAccount({ plan: 'plus', creditsRemaining: 3, creditsPeriodKey: '2026-10' } as never, OCT);
    expect(changed).toBe(true);
    expect(account).toMatchObject({ plan: 'plus', tokensUsed: 0, dayKey: '2026-10-04' });
  });

  it('resets lazily when the day changes', () => {
    const { account, changed } = resolveAccount({ plan: 'standard', dayKey: '2026-10-03', tokensUsed: 199_000, dailyTokenLimit: DAILY_TOKEN_LIMIT.standard }, OCT);
    expect(changed).toBe(true);
    expect(account.tokensUsed).toBe(0);
  });

  it('leaves today alone', () => {
    const { account, changed } = resolveAccount(
      { plan: 'standard', betaTier: true, dayKey: '2026-10-04', tokensUsed: 4321, dailyTokenLimit: DAILY_TOKEN_LIMIT.standard },
      OCT,
    );
    expect(changed).toBe(false);
    expect(account.tokensUsed).toBe(4321);
  });

  it('treats unknown plans as standard', () => {
    expect(resolveAccount({ plan: 'gold' as never, dayKey: '2026-10-04', tokensUsed: 3 }, OCT).account.plan).toBe('standard');
  });
});

describe('spoken reply parts', () => {
  it('starts with one sentence, then sentence-aligned chunks', () => {
    const reply = 'It sounds like part of you wants this and part of you is holding back. What is the part that is holding back afraid of? Take a moment with that. There is no rush.';
    const parts = voiceParts(reply);
    expect(parts[0]).toBe('It sounds like part of you wants this and part of you is holding back.');
    expect(parts.join(' ')).toBe(reply);
    expect(voiceParts(reply)).toEqual(parts);
  });

  it('never starts with a clipped fragment, and caps the number of parts', () => {
    expect(voiceParts('Mm. That matters. What would you like to do next?')[0]).toBe('Mm. That matters. What would you like to do next?');
    const long = Array.from({ length: 60 }, (_, i) => `This is sentence number ${i} of a long reply.`).join(' ');
    const parts = voiceParts(long);
    expect(parts.length).toBe(MAX_AUDIO_PARTS);
    expect(parts.join(' ')).toBe(long);
    expect(voiceParts('')).toEqual([]);
    expect(voiceParts('No full stop at the end')).toEqual(['No full stop at the end']);
  });
});

describe('rate limit', () => {
  it('allows up to 8 per minute and reports when to retry', () => {
    let recent: number[] = [];
    for (let i = 0; i < 8; i++) {
      const result = checkRateLimit(recent, OCT + i * 1000);
      expect(result.ok).toBe(true);
      if (result.ok) recent = result.recent;
    }
    const blocked = checkRateLimit(recent, OCT + 8000);
    expect(blocked).toEqual({ ok: false, retryAfterMs: 52_000 });
    expect(checkRateLimit(recent, OCT + 61_000).ok).toBe(true);
  });

  it('caps the hour and drops old timestamps', () => {
    const recent = Array.from({ length: 60 }, (_, i) => OCT - 3_000_000 + i * 50_000);
    expect(checkRateLimit(recent, OCT).ok).toBe(false);
    const later = checkRateLimit(recent, OCT + 700_000);
    expect(later.ok).toBe(true);
    if (later.ok) expect(later.recent.length).toBeLessThan(60);
  });
});

describe('request validation', () => {
  const good = { requestId: 'req12345678', conversationId: 'c1', kind: 'message', text: '  hello  ', mode: 'normal' };

  it('accepts a trimmed message and a free opener', () => {
    expect(parseCoachTurnRequest(good)).toMatchObject({ requestId: 'req12345678', kind: 'message', text: 'hello', mode: 'normal' });
    expect(
      parseCoachTurnRequest({
        requestId: 'opener_c1xxxx',
        conversationId: 'c1',
        kind: 'opener',
        mode: 'reflection',
        reflectionCheckInId: '2026-10-01',
      }),
    ).toMatchObject({ kind: 'opener', mode: 'reflection' });
  });

  it('rejects an over-long message as text-too-long and malformed input as invalid-request', () => {
    expect(() => parseCoachTurnRequest({ ...good, text: 'x'.repeat(4001) })).toThrowError(/text-too-long/);
    for (const data of [
      null,
      { ...good, text: '   ' },
      { ...good, kind: 'essay' },
      { ...good, requestId: 'short' },
      { ...good, conversationId: '../x' },
      { ...good, mode: 'therapy' },
      { ...good, mode: 'reflection' },
    ]) {
      expect(() => parseCoachTurnRequest(data)).toThrow(CoachError);
    }
  });

  it('validates voice payloads against the app limits', () => {
    const base64 = Buffer.from('I feel stuck'.padEnd(80, ' ')).toString('base64');
    const ok = parseVoiceTurnRequest({
      requestId: 'req12345678',
      conversationId: 'c1',
      mode: 'normal',
      audio: { base64, mimeType: 'audio/m4a', durationMs: 3000 },
    });
    expect(ok.audioBytes.length).toBeGreaterThan(32);
    expect(ok.wantAudio).toBe(true);
    const voice = { requestId: 'req12345678', conversationId: 'c1', mode: 'normal' };
    expect(() => parseVoiceTurnRequest({ ...voice, audio: { base64, mimeType: 'video/mp4', durationMs: 1000 } })).toThrow(CoachError);
    expect(() => parseVoiceTurnRequest({ ...voice, audio: { base64, mimeType: 'audio/m4a', durationMs: 90_000 } })).toThrowError(/audio-too-long/);
  });
});

describe('thinking and audio part requests', () => {
  const base = { requestId: 'req12345678', conversationId: 'c1', kind: 'message', text: 'hi', mode: 'normal' };
  it('accepts the three thinking levels and nothing else', () => {
    expect(parseCoachTurnRequest(base)).not.toHaveProperty('thinking');
    for (const thinking of ['standard', 'deeper', 'deepest']) expect(parseCoachTurnRequest({ ...base, thinking }).thinking).toBe(thinking);
    expect(() => parseCoachTurnRequest({ ...base, thinking: 'max' })).toThrow(CoachError);
    expect(() => parseCoachTurnRequest({ ...base, thinking: 'high' })).toThrow(CoachError);
  });

  it('only asks for later parts of a known turn', () => {
    expect(parseVoiceAudioRequest({ requestId: 'req12345678', part: 1 })).toEqual({ requestId: 'req12345678', part: 1 });
    for (const part of [0, -1, 1.5, MAX_AUDIO_PARTS, '1']) expect(() => parseVoiceAudioRequest({ requestId: 'req12345678', part })).toThrow(CoachError);
    expect(() => parseVoiceAudioRequest({ requestId: 'x', part: 1 })).toThrow(CoachError);
  });
});

describe('error mapping', () => {
  it('uses the reason names and codes the app already handles', () => {
    const exhausted = toHttpsError(new CoachError('no-credits', { resetsAt: Date.UTC(2026, 9, 5) }));
    expect(exhausted).toBeInstanceOf(HttpsError);
    expect(exhausted.code).toBe('resource-exhausted');
    expect(exhausted.details).toEqual({
      reason: 'no-credits',
      retryable: false,
      resetsAt: Date.UTC(2026, 9, 5),
    });
    expect(toHttpsError(new CoachError('provider-unavailable', { refunded: true })).details).toMatchObject({ retryable: true, refunded: true });
    expect(toHttpsError(new CoachError('in-progress')).code).toBe('aborted');
    expect(toHttpsError(new CoachError('conversation-not-found')).code).toBe('not-found');
    expect(toHttpsError(new CoachError('rate-limited', { retryAfterSeconds: 12 })).details).toMatchObject({ retryAfterSeconds: 12 });
  });

  it('never leaks unexpected error text', () => {
    const error = toHttpsError(new Error('GEMINI key AIza rejected at https://generativelanguage'));
    expect(error.code).toBe('internal');
    expect(error.message).not.toMatch(/gemini|AIza|generativelanguage/i);
  });
});

describe('playable mock voice (phone testing against the emulator)', () => {
  it('gives a real recording a readable transcript and replies with real WAV audio', async () => {
    const voice = new MockVoice({ playable: true });
    const m4a = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypM4A '), Buffer.alloc(64, 0x9c)]);
    expect((await voice.transcribe(m4a)).text).toBe(MOCK_SPOKEN_TRANSCRIPT);
    expect((await voice.transcribe(Buffer.from('I feel stuck'))).text).toBe('I feel stuck');
    const speech = await voice.synthesize('What do you notice?');
    expect(speech.data.subarray(0, 4).toString()).toBe('RIFF');
    expect(speech.data.subarray(8, 12).toString()).toBe('WAVE');
    expect(speech.data.readUInt32LE(40)).toBe(speech.data.length - 44);
  });
});
