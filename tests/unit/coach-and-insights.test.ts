import { describe, expect, it } from 'vitest';

import { buildTimeline, formatRelativeTime, isTurnSynced, sessionGreeting, titleFromMessage, type PendingTurn } from '@/features/chat/chat';
import { focusAreas, weekActivity } from '@/features/insights/insights';
import { CoachError, toCoachError } from '@/services/coach/errors';
import type { ChatMessage, Goal } from '@/types/models';

const goal = (id: string, category: Goal['category']): Goal => ({
  id,
  title: id,
  category,
  status: 'active',
  progress: 0,
  createdAt: 0,
  updatedAt: 0,
});

const message = (id: string, role: 'user' | 'coach', clientTurnId: string, createdAt: number): ChatMessage => ({
  id,
  role,
  text: id,
  clientTurnId,
  channel: 'text',
  createdAt,
});

describe('weekActivity', () => {
  it('starts on Monday and marks today', () => {
    const week = weekActivity(['2026-10-05', '2026-10-08'], '2026-10-08');
    expect(week.map((d) => d.date)).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
    expect(week.map((d) => d.label)).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
    expect(week.filter((d) => d.checkedIn).map((d) => d.date)).toEqual(['2026-10-05', '2026-10-08']);
    expect(week.find((d) => d.isToday)?.date).toBe('2026-10-08');
  });

  it('keeps a Sunday inside the week that began the previous Monday', () => {
    const week = weekActivity(['2026-10-04'], '2026-10-04');
    expect(week[0]?.date).toBe('2026-09-28');
    expect(week[6]).toMatchObject({ date: '2026-10-04', checkedIn: true, isToday: true });
  });
});

describe('focusAreas', () => {
  it('returns the top three categories as percentages', () => {
    const areas = focusAreas([
      goal('a', 'career'),
      goal('b', 'career'),
      goal('c', 'health'),
      goal('d', 'social'),
      goal('e', 'finance'),
    ]);
    expect(areas.map((a) => a.category)).toEqual(['career', 'health', 'social']);
    expect(areas[0]).toMatchObject({ value: 40, color: '#2563EB', label: 'Career' });
    expect(areas[1]?.value).toBe(20);
  });

  it('is empty without goals', () => {
    expect(focusAreas([])).toEqual([]);
  });
});

describe('chat timeline', () => {
  const pending = (over: Partial<PendingTurn> = {}): PendingTurn => ({
    requestId: 'turn1',
    uid: 'u',
    conversationId: 'c',
    text: 'Hello there',
    createdAt: 10,
    status: 'sending',
    ...over,
  });

  it('keeps a pending user bubble until the server stores that turn', () => {
    const items = buildTimeline([], [pending()]);
    expect(items).toEqual([
      { key: 'pending-turn1', role: 'user', text: 'Hello there', state: 'sending', requestId: 'turn1', error: undefined },
    ]);
  });

  it('shows a delivered reply until the coach document arrives, then drops the local turn', () => {
    const turn = pending({ status: 'delivered', reply: { text: 'Hi', createdAt: 20 } });
    const userOnly = [message('turn1-u', 'user', 'turn1', 10)];
    expect(buildTimeline(userOnly, [turn]).map((i) => i.key)).toEqual(['turn1-u', 'pending-reply-turn1']);
    expect(isTurnSynced(turn, userOnly)).toBe(false);

    const both = [...userOnly, message('turn1-c', 'coach', 'turn1', 20)];
    expect(buildTimeline(both, [turn]).some((i) => i.key.startsWith('pending'))).toBe(false);
    expect(isTurnSynced(turn, both)).toBe(true);
  });

  it('titles from the first message the way the prototype did', () => {
    expect(titleFromMessage('  hello   world  ')).toBe('hello world');
    expect(titleFromMessage('abcdefghijklmnopqrstuvwxyz123456')).toBe('abcdefghijklmnopqrstuvwxyz1234...');
    expect(sessionGreeting('reflection')).toContain('check-in');
    expect(sessionGreeting('normal')).not.toContain('check-in');
  });

  it('formats relative times', () => {
    const now = Date.UTC(2026, 9, 8, 12, 0, 0);
    expect(formatRelativeTime(now - 10_000, now)).toBe('Just now');
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('5m ago');
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe('3h ago');
    expect(formatRelativeTime(now - 2 * 86_400_000, now)).toBe('2d ago');
  });
});

describe('toCoachError', () => {
  it('maps contract reasons and keeps retry timing', () => {
    const error = toCoachError({
      code: 'functions/aborted',
      details: { reason: 'turn-in-progress', retryable: true, retryAfterMs: 1500 },
    });
    expect(error).toBeInstanceOf(CoachError);
    expect(error.reason).toBe('turn-in-progress');
    expect(error.retryable).toBe(true);
    expect(error.retryAfterMs).toBe(1500);
    expect(error.message).not.toMatch(/gemini|deepgram|stack/i);
  });

  it('treats a bare not-found as the function not being deployed', () => {
    expect(toCoachError({ code: 'not-found' }).reason).toBe('not-deployed');
  });

  it('maps the previous draft’s reason names', () => {
    expect(toCoachError({ code: 'unavailable', details: { reason: 'provider-unavailable' } }).reason).toBe('ai-unavailable');
    expect(toCoachError({ code: 'resource-exhausted', details: { reason: 'no-credits', retryable: false } })).toMatchObject({
      reason: 'no-credits',
      retryable: false,
    });
  });

  it('maps codes when the backend omits a reason', () => {
    expect(toCoachError({ code: 'functions/unauthenticated' }).reason).toBe('unauthenticated');
    expect(toCoachError({ code: 'deadline-exceeded' }).reason).toBe('network');
    expect(toCoachError({ code: 'invalid-argument' }).reason).toBe('invalid-input');
  });
});
