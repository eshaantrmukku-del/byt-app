import { describe, expect, it } from 'vitest';

import { detectCrisis, heuristicAnalysis, normaliseAnalysis } from '../../src/engine/analysis.js';
import { buildContextBlock, recentCheckIns } from '../../src/engine/context.js';
import { runCoachingEngine } from '../../src/engine/engine.js';
import { checkReply, hasBlocking, sanitiseReply } from '../../src/engine/guard.js';
import { selectMoves } from '../../src/engine/policy.js';
import { unsummarised } from '../../src/engine/summarise.js';
import type { CheckInContext, MovePlan } from '../../src/engine/types.js';
import { MockLlm } from '../../src/llm/mock.js';
import { makeAnalysis, makeContext } from '../fixtures.js';

const plan = (over: Partial<MovePlan> = {}): MovePlan => ({ primary: 'reflect_and_deepen', maxQuestions: 1, targetWords: 55, why: '', ...over });

describe('turn analysis', () => {
  const ctx = makeContext();

  it('spots explicit advice requests and leaves ordinary sharing alone', () => {
    expect(heuristicAnalysis('What should I do about my manager?', ctx).explicitAdviceRequest).toBe(true);
    expect(heuristicAnalysis('Give me some tips for interviews', ctx).explicitAdviceRequest).toBe(true);
    expect(heuristicAnalysis('I keep putting off applying for university.', ctx).explicitAdviceRequest).toBe(false);
  });

  it('flags crisis language, including casual phrasing', () => {
    for (const text of ['I just want to die', 'thinking about ending my life', "honestly I'd be better off dead", 'I cut myself again']) {
      expect(detectCrisis(text), text).toBe(true);
      expect(heuristicAnalysis(text, ctx).risk).toBe('crisis');
    }
    expect(detectCrisis('this deadline is killing me')).toBe(false);
  });

  it('notices commitments, insights, resistance and the relevant goal', () => {
    expect(heuristicAnalysis("I'll send the application on Friday.", ctx).commitmentStated).toBe(true);
    expect(heuristicAnalysis("Oh. I just realised I'm scared of succeeding.", ctx).insightMoment).toBe(true);
    expect(heuristicAnalysis("This coaching stuff doesn't work for me", ctx).resistance).toBe(true);
    expect(heuristicAnalysis('The masters applications are due soon', ctx).relevantGoalIds).toEqual(['g1']);
  });

  it('treats a session opener as an opening, and a reflection opener as check-in context', () => {
    expect(heuristicAnalysis('(The user opened a new coaching session and is waiting for you to start.)', ctx).stage).toBe('opening');
    expect(heuristicAnalysis('(The user opened a reflection on their recent check-ins and is waiting for you to start.)', ctx).useCheckIns).toBe(true);
  });

  it('never lowers a crisis flag the pattern matcher already raised', () => {
    const analysis = normaliseAnalysis(
      { risk: 'none', emotionalIntensity: 9, stage: 'nonsense', relevantGoalIds: ['g1', 'zzz'] },
      makeAnalysis({ risk: 'crisis' }),
      new Set(['g1']),
    );
    expect(analysis.risk).toBe('crisis');
    expect(analysis.emotionalIntensity).toBe(3);
    expect(analysis.stage).toBe('exploring');
    expect(analysis.relevantGoalIds).toEqual(['g1']);
  });
});

describe('move policy', () => {
  it('puts safety above an advice request', () => {
    expect(selectMoves(makeAnalysis({ risk: 'crisis', explicitAdviceRequest: true }), [], 'text').primary).toBe('safety');
  });

  it('answers an explicit advice request with a perspective', () => {
    expect(selectMoves(makeAnalysis({ explicitAdviceRequest: true }), [], 'text').primary).toBe('advice_with_permission');
  });

  it('meets strong emotion before challenging an assumption', () => {
    expect(selectMoves(makeAnalysis({ emotionalIntensity: 2, emotions: ['frustrated'], assumptions: ['x'] }), [{ role: 'coach', text: 'hi' }], 'text').primary).toBe('acknowledge_and_explore');
  });

  it('lands insights, makes commitments concrete and checks accountability', () => {
    expect(selectMoves(makeAnalysis({ insightMoment: true }), [], 'text').primary).toBe('deepen_insight');
    expect(selectMoves(makeAnalysis({ commitmentStated: true }), [], 'text').primary).toBe('secure_commitment');
    expect(selectMoves(makeAnalysis({ intent: 'report_progress' }), [], 'text').primary).toBe('accountability_check');
  });

  it('stops circling after several purely exploratory turns', () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      role: (i % 2 ? 'coach' : 'user') as 'coach' | 'user',
      text: i % 2 ? 'What do you notice about that?' : 'hmm',
    }));
    expect(selectMoves(makeAnalysis(), history, 'text').primary).toBe('clarify_want');
  });

  it('keeps a voice reply shorter than a text one', () => {
    expect(selectMoves(makeAnalysis({ explicitAdviceRequest: true }), [], 'voice').targetWords).toBeLessThanOrEqual(50);
  });
});

describe('guardrails', () => {
  const profile = makeContext().profile;
  const run = (reply: string, chosen = plan(), channel: 'text' | 'voice' = 'text', userTexts = ['I keep putting it off']) =>
    checkReply({ reply, plan: chosen, channel, profile, userTexts }).map((issue) => issue.check);

  it('passes a short coaching reply', () => {
    const issues = checkReply({
      reply: 'Something keeps stopping you right at the point of applying. What do you notice when you imagine hitting submit?',
      plan: plan(),
      channel: 'text',
      profile,
      userTexts: ['x'],
    });
    expect(hasBlocking(issues)).toBe(false);
  });

  it('catches lists, directives and generic praise', () => {
    expect(run("Great question! Here's what to do:\n1. You should make a plan\n2. Break it down")).toEqual(
      expect.arrayContaining(['list', 'directive', 'praise']),
    );
  });

  it('catches a barrage of questions and a lecture', () => {
    expect(run('What? Why? How? When?')).toContain('questions');
    expect(run(`${Array(200).fill('word').join(' ')}?`)).toContain('length');
  });

  it('catches profile details the user did not bring up', () => {
    expect(run('As a junior software developer at a fintech startup who lives with flatmates in manchester, what matters here?')).toContain('profile-recital');
    expect(run('Fear of being judged — what does that look like?', plan(), 'text', ['my fear of being judged'])).not.toContain('profile-recital');
  });

  it('catches a claim of human experience, technique talk and diagnosis', () => {
    expect(run("When I was your age I felt the same. What's next?")).toContain('human-claim');
    expect(run("Let me ask a powerful question: what's next?")).toContain('meta');
    expect(run('It sounds like you have depression. What do you think?')).toContain('therapy');
  });

  it('lets a safety reply be directive, and strips formatting', () => {
    expect(run('You need to call 999 now. Are you safe?', plan({ primary: 'safety' }))).not.toContain('directive');
    expect(sanitiseReply('**Bold**\n- item\n1. step', 'text')).toBe('Bold\nitem\nstep');
  });
});

describe('context selection', () => {
  const day = (date: string): CheckInContext => ({ date, moods: ['calm'], happiness: 6, stress: 4, sleep: 7 });
  const checkIns = ['2026-09-01', '2026-09-20', '2026-09-21', '2026-10-01', '2026-10-04'].map(day);

  it('never passes check-ins older than 14 days', () => {
    expect(recentCheckIns(checkIns, '2026-10-04').map((c) => c.date)).toEqual(['2026-09-21', '2026-10-01', '2026-10-04']);
    const block = buildContextBlock(makeContext({ checkIns, mode: 'reflection' }), 'how have I been', makeAnalysis());
    expect(block).toContain('2026-09-21');
    expect(block).not.toContain('2026-09-20');
    expect(block).not.toContain('2026-09-01');
  });

  it('leaves check-ins and the journal out of ordinary chat', () => {
    const ctx = makeContext({
      checkIns,
      journal: [{ date: '2026-10-03', text: 'Wrote about my dad' }],
      history: [{ role: 'user', text: 'hi' }, { role: 'coach', text: 'hello' }],
    });
    expect(buildContextBlock(ctx, 'work is fine', makeAnalysis())).not.toMatch(/CHECK-INS|JOURNAL/);
    const relevant = buildContextBlock(ctx, 'I slept badly', makeAnalysis({ useCheckIns: true, useJournal: true }));
    expect(relevant).toMatch(/CHECK-INS/);
    expect(relevant).toContain('Wrote about my dad');
  });

  it('mentions income only when money is the topic, and only the relevant goal', () => {
    expect(buildContextBlock(makeContext(), 'I feel stuck', makeAnalysis())).not.toContain('£32k');
    expect(buildContextBlock(makeContext(), 'Should I ask for a raise?', makeAnalysis())).toContain('£32k');
    const block = buildContextBlock(makeContext({ history: [{ role: 'user', text: 'hi' }] }), 'the applications', makeAnalysis({ relevantGoalIds: ['g1'] }));
    expect(block).toContain('Apply for masters');
    expect(block).not.toContain('half marathon');
  });
});

describe('rolling summary', () => {
  it('folds messages that have left the window once enough have accumulated', () => {
    const history = Array.from({ length: 40 }, (_, i) => ({ role: (i % 2 ? 'coach' : 'user') as 'coach' | 'user', text: `m${i}` }));
    const fresh = unsummarised(makeContext({ history, historyTotal: 40, summaryMessageCount: 0 }));
    expect(fresh.upTo).toBe(24);
    expect(fresh.messages.map((m) => m.text)).toEqual(history.slice(0, 24).map((m) => m.text));
    expect(unsummarised(makeContext({ history, historyTotal: 40, summaryMessageCount: 20 })).messages).toEqual([]);
  });
});

describe('engine with the offline model', () => {
  const models = { reply: 'mock-coach', analysis: 'mock-coach', summary: 'mock-coach' };

  it('analyses, chooses a move and replies', async () => {
    const llm = new MockLlm();
    const result = await runCoachingEngine(llm, { text: 'I keep putting off applying for university.', channel: 'text', context: makeContext() }, { models });
    expect(result.trace.plan.primary).toBe('reflect_and_deepen');
    expect(hasBlocking(result.trace.guardIssues)).toBe(false);
    expect(result.reply).toMatch(/\?$/);
    expect(llm.calls.map((call) => call.purpose)).toEqual(['analysis', 'reply']);
  });

  it('rewrites a generic-assistant draft', async () => {
    const llm = new MockLlm();
    const result = await runCoachingEngine(llm, { text: 'I keep procrastinating', channel: 'text', context: makeContext() }, { models: { reply: 'mock-naive' } });
    expect(llm.calls.filter((call) => call.purpose === 'reply')).toHaveLength(2);
    expect(result.reply).not.toMatch(/^\s*\d+\./m);
  });

  it('routes a crisis turn to safety even when the model is down', async () => {
    const result = await runCoachingEngine(
      new MockLlm({ failPurposes: ['reply', 'analysis'] }),
      { text: "I don't want to be alive anymore", channel: 'voice', context: makeContext() },
    );
    expect(result.trace.plan.primary).toBe('safety');
    expect(result.reply).toMatch(/116 123|988|emergency/);
  });

  it('falls back when analysis fails, and fails the turn when the reply call fails', async () => {
    const result = await runCoachingEngine(
      new MockLlm({ failPurposes: ['analysis'] }),
      { text: 'hello', channel: 'text', context: makeContext() },
      { models },
    );
    expect(result.trace.analysisSource).toBe('fallback');
    await expect(
      runCoachingEngine(new MockLlm({ failPurposes: ['reply'] }), { text: 'hello', channel: 'text', context: makeContext() }),
    ).rejects.toThrow();
  });
});
