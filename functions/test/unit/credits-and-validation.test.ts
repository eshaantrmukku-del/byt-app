import { HttpsError } from 'firebase-functions/v2/https';
import { describe, expect, it } from 'vitest';

import { resolveAccount } from '../../src/credits/ledger.js';
import { checkRateLimit, nextPeriodStart, periodKey } from '../../src/credits/period.js';
import { CoachError, toHttpsError } from '../../src/errors.js';
import { parseCoachTurnRequest, parseVoiceTurnRequest } from '../../src/validation.js';

const OCT = Date.UTC(2026, 9, 4, 12);

describe('credit periods', () => {
  it('uses UTC calendar months', () => {
    expect(periodKey(OCT)).toBe('2026-10');
    expect(periodKey(Date.UTC(2026, 11, 31, 23, 59))).toBe('2026-12');
    expect(periodKey(Date.UTC(2027, 0, 1))).toBe('2027-01');
    expect(nextPeriodStart(OCT)).toBe(Date.UTC(2026, 10, 1));
  });

  it('creates a 150-credit standard beta account on first use', () => {
    const { account, changed } = resolveAccount(undefined, OCT);
    expect(changed).toBe(true);
    expect(account).toMatchObject({ plan: 'standard', betaTier: true, creditsRemaining: 150, creditsPeriodKey: '2026-10' });
  });

  it('resets lazily when the month changes and keeps the plan', () => {
    const { account, changed } = resolveAccount(
      { plan: 'plus', creditsRemaining: 0, creditsPeriodKey: '2026-09', monthlyAllowance: 150 },
      OCT,
    );
    expect(changed).toBe(true);
    expect(account).toMatchObject({ plan: 'plus', creditsRemaining: 150, creditsPeriodKey: '2026-10' });
  });

  it('leaves the current month alone', () => {
    const { account, changed } = resolveAccount(
      { plan: 'standard', betaTier: true, creditsRemaining: 7, creditsPeriodKey: '2026-10', monthlyAllowance: 150 },
      OCT,
    );
    expect(changed).toBe(false);
    expect(account.creditsRemaining).toBe(7);
  });

  it('treats unknown plans as standard', () => {
    expect(resolveAccount({ plan: 'gold' as never, creditsRemaining: 3, creditsPeriodKey: '2026-10' }, OCT).account.plan).toBe('standard');
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

describe('error mapping', () => {
  it('uses the reason names and codes the app already handles', () => {
    const exhausted = toHttpsError(new CoachError('no-credits', { remaining: 0, resetsAt: '2026-11-01T00:00:00.000Z' }));
    expect(exhausted).toBeInstanceOf(HttpsError);
    expect(exhausted.code).toBe('resource-exhausted');
    expect(exhausted.details).toEqual({
      reason: 'no-credits',
      retryable: false,
      remaining: 0,
      resetsAt: '2026-11-01T00:00:00.000Z',
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
