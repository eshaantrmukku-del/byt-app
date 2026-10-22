import { describe, expect, it } from 'vitest';

import { heuristicAnalysis } from '../../src/engine/analysis.js';
import { buildContextBlock } from '../../src/engine/context.js';
import { SKILLS } from '../../src/engine/framework.js';
import { checkReply, hasBlocking } from '../../src/engine/guard.js';
import { allianceDue, applyMemoryDelta, emptyMemory, memoryDeltaFor, readMemory } from '../../src/engine/memory.js';
import { MOVE_SPECS } from '../../src/engine/moves.js';
import { selectMoves } from '../../src/engine/policy.js';
import { buildReplySystem } from '../../src/engine/prompt.js';
import { MOVES, type HistoryMessage, type Move, type MovePlan } from '../../src/engine/types.js';
import { makeAnalysis, makeContext } from '../fixtures.js';

const NOW = Date.UTC(2026, 9, 22, 12);
const plan = (primary: Move): MovePlan => ({ primary, maxQuestions: 1, targetWords: 55, why: '' });
const turns = (n: number): HistoryMessage[] =>
  Array.from({ length: n * 2 }, (_, i) => ({ role: (i % 2 ? 'coach' : 'user') as 'coach' | 'user', text: i % 2 ? 'What do you notice?' : 'hmm' }));

describe('framework coverage', () => {
  it('gives every move guidance and only real skills', () => {
    for (const move of MOVES) {
      expect(MOVE_SPECS[move].guidance.length, move).toBeGreaterThan(40);
      for (const skill of MOVE_SPECS[move].skills) expect(SKILLS[skill], `${move} → ${skill}`).toBeDefined();
    }
  });

  it('uses every skill in at least one move', () => {
    const used = new Set(MOVES.flatMap((m) => MOVE_SPECS[m].skills));
    expect(Object.keys(SKILLS).filter((s) => !used.has(s as never))).toEqual([]);
  });

  it('keeps every illustration within the rules of its own move', () => {
    const profile = makeContext().profile;
    for (const move of MOVES) {
      for (const example of MOVE_SPECS[move].examples) {
        const issues = checkReply({ reply: example.coach, plan: plan(move), channel: 'text', profile, userTexts: [example.user] });
        expect(issues.filter((i) => i.severity === 'block').map((i) => i.check), `${move}: ${example.coach}`).toEqual([]);
      }
    }
  });

  it('puts the skills behind the move into the reply prompt', () => {
    const system = buildReplySystem({ plan: plan('name_inner_critic'), analysis: makeAnalysis(), channel: 'text', contextBlock: '', today: '2026-10-22', mode: 'normal' });
    expect(system).toContain('Naming the inner critic');
    expect(system).toContain('Creative, resourceful and whole');
  });
});

describe('listening signals', () => {
  const ctx = makeContext();
  it('hears the inner critic, a request for ideas, a forced either/or and a wrap-up', () => {
    expect(heuristicAnalysis("I'm not smart enough for this course.", ctx).innerCritic).toMatch(/not smart enough/);
    const ideas = heuristicAnalysis('Any ideas for fitting running into my week?', ctx);
    expect(ideas.wantsIdeas).toBe(true);
    expect(ideas.explicitAdviceRequest).toBe(false);
    expect(heuristicAnalysis('There is no other way, I either quit or stay miserable.', ctx).singlePerspective).toBe(true);
    expect(heuristicAnalysis("Thanks, that's helpful. I have to go now.", ctx).intent).toBe('closing');
  });

  it('hears how they want to be coached', () => {
    expect(heuristicAnalysis("Can you be more blunt with me? I don't need hand-holding.", ctx).allianceNote).toMatch(/blunt with me/);
  });

  it('tells a kept commitment from a missed one, and links it to the open one', () => {
    const memory = applyMemoryDelta(emptyMemory(), { commitment: { action: 'Send two applications', when: 'Friday' } }, { nowMs: NOW, conversationId: 'c1', commitmentId: 'r1' });
    const withMemory = makeContext({ memory });
    const kept = heuristicAnalysis('Update: I finally sent the applications yesterday.', withMemory);
    expect(kept.progressOutcome).toBe('kept');
    expect(kept.resolvedCommitmentId).toBe('r1');
    expect(heuristicAnalysis("I didn't do the applications I said I'd do.", withMemory).progressOutcome).toBe('missed');
  });

  it('notices a theme across several messages', () => {
    const history: HistoryMessage[] = [
      { role: 'user', text: 'My mother keeps calling about the wedding.' },
      { role: 'coach', text: 'What is that like?' },
      { role: 'user', text: 'Exhausting. My mother has opinions about everything.' },
      { role: 'coach', text: 'What do you notice?' },
    ];
    expect(heuristicAnalysis('And work is fine, but my mother wants me to move home.', makeContext({ history })).pattern).toBe('"mother" keeps coming up');
  });
});

describe('move policy (framework moves)', () => {
  it('designs the alliance at the start of the relationship, once', () => {
    const opener = makeAnalysis({ intent: 'small_talk', stage: 'opening' });
    expect(selectMoves(opener, [], 'text', { allianceDue: true }).primary).toBe('design_alliance');
    expect(selectMoves(opener, [], 'text', { allianceDue: false }).primary).toBe('open_session');
    expect(selectMoves(opener, [], 'text', { allianceDue: true, reflection: true }).primary).toBe('open_session');
    expect(allianceDue(undefined, NOW)).toBe(true);
    expect(allianceDue({ ...emptyMemory(), allianceAskedAt: NOW - 86_400_000 }, NOW)).toBe(false);
    expect(allianceDue({ ...emptyMemory(), alliance: ['be direct'] }, NOW)).toBe(false);
  });

  it('takes on a stated coaching preference straight away', () => {
    expect(selectMoves(makeAnalysis({ allianceNote: 'be blunt with me' }), turns(2), 'text').primary).toBe('design_alliance');
  });

  it('lets venting clear before any coaching, but still meets other strong feeling', () => {
    expect(selectMoves(makeAnalysis({ intent: 'vent', emotionalIntensity: 2 }), [], 'text').primary).toBe('clearing');
    expect(selectMoves(makeAnalysis({ intent: 'share', emotionalIntensity: 2 }), [], 'text').primary).toBe('acknowledge_and_explore');
  });

  it('names the inner critic before treating it as an assumption', () => {
    expect(selectMoves(makeAnalysis({ innerCritic: "I'm not smart enough", assumptions: ['x'] }), turns(1), 'text').primary).toBe('name_inner_critic');
  });

  it('acknowledges a kept commitment and asks about a missed one', () => {
    expect(selectMoves(makeAnalysis({ progressOutcome: 'kept', intent: 'report_progress' }), [], 'text').primary).toBe('acknowledge');
    expect(selectMoves(makeAnalysis({ progressOutcome: 'missed', intent: 'report_progress' }), [], 'text').primary).toBe('accountability_check');
  });

  it('stretches a small commitment only once there is a relationship in the conversation', () => {
    const small = makeAnalysis({ commitmentStated: true, playingSmall: true });
    expect(selectMoves(small, turns(1), 'text').primary).toBe('secure_commitment');
    expect(selectMoves(small, turns(3), 'text').primary).toBe('make_request');
  });

  it('offers a hunch about a pattern, explores values in a decision and opens a fixed view', () => {
    expect(selectMoves(makeAnalysis({ pattern: '"yes" keeps coming up' }), turns(2), 'text').primary).toBe('offer_intuition');
    expect(selectMoves(makeAnalysis({ intent: 'decide' }), [], 'text').primary).toBe('explore_values');
    expect(selectMoves(makeAnalysis({ singlePerspective: true }), [], 'text').primary).toBe('explore_perspectives');
  });

  it('brainstorms when asked for ideas, bottom-lines a long story and closes with an inquiry', () => {
    expect(selectMoves(makeAnalysis({ wantsIdeas: true }), [], 'text').primary).toBe('brainstorm');
    expect(selectMoves(makeAnalysis({ storytelling: true }), turns(1), 'text').primary).toBe('bottom_line');
    expect(selectMoves(makeAnalysis({ intent: 'closing' }), turns(3), 'text').primary).toBe('close_with_inquiry');
  });
});

describe('Co-Active reply checks', () => {
  const profile = makeContext().profile;
  const run = (reply: string, move: Move = 'reflect_and_deepen') =>
    checkReply({ reply, plan: plan(move), channel: 'text', profile, userTexts: ['x'] }).filter((i) => i.severity === 'block').map((i) => i.check);

  it('rejects why, yes/no and leading questions while exploring', () => {
    expect(run('That sounds heavy. Why do you keep doing that?')).toContain('why-question');
    expect(run('That sounds heavy. Do you think it will change?')).toContain('closed-question');
    expect(run('That sounds heavy. Have you considered talking to your manager?')).toContain('leading-question');
    expect(run('That sounds heavy. What do you notice when it happens?')).toEqual([]);
  });

  it('rejects solving the problem unless they asked for options', () => {
    expect(run("Here's how to fix it: block out an hour. What do you think?")).toContain('solving');
    expect(run("Here's how to fix it: block out an hour. What do you think?", 'brainstorm')).not.toContain('solving');
  });

  it('keeps hunches light and requests free to refuse', () => {
    expect(run('You are avoiding your mother. What else?', 'offer_intuition')).toContain('intuition-attached');
    expect(run('I might be off, but I notice your mother keeps coming up. Does that fit?', 'offer_intuition')).toEqual([]);
    expect(run('I have a request: send three by Friday.', 'make_request')).toContain('request-no-choice');
    expect(run('I have a request: send three by Friday. You can say yes, no, or counter-offer.', 'make_request')).toEqual([]);
  });
});

describe('coach memory', () => {
  it('records commitments, resolves them, dedupes the alliance and counts values', () => {
    const p = { nowMs: NOW, conversationId: 'c1', commitmentId: 'r1' };
    let m = applyMemoryDelta(emptyMemory(), { commitment: { action: 'Two applications', when: 'Friday' }, alliance: 'Be direct', values: ['Growth', 'family'] }, p);
    m = applyMemoryDelta(m, { alliance: 'be direct', values: ['growth'], resolve: { id: 'r1', outcome: 'kept' } }, { ...p, commitmentId: 'r2' });
    expect(m.alliance).toEqual(['Be direct']);
    expect(m.values[0]).toEqual({ name: 'growth', count: 2 });
    expect(m.commitments).toEqual([expect.objectContaining({ id: 'r1', status: 'kept', when: 'Friday' })]);
  });

  it('drops malformed stored data instead of trusting it', () => {
    const m = readMemory({ alliance: ['ok', 3, ''], commitments: [{ id: 'a', text: 't', status: 'weird' }, { id: 'b', text: 't', status: 'open' }], values: 'nope' });
    expect(m.alliance).toEqual(['ok']);
    expect(m.commitments.map((c) => c.id)).toEqual(['b']);
    expect(m.values).toEqual([]);
  });

  it('learns from a turn only what the turn said', () => {
    expect(memoryDeltaFor(makeAnalysis(), plan('reflect_and_deepen'))).toBeUndefined();
    expect(memoryDeltaFor(makeAnalysis(), plan('design_alliance'))).toEqual({ allianceAsked: true });
    expect(memoryDeltaFor(makeAnalysis({ commitmentStated: true, commitment: { action: 'Run on Tuesday', when: 'Tuesday' } }), plan('secure_commitment'))).toEqual({
      commitment: { action: 'Run on Tuesday', when: 'Tuesday' },
    });
  });

  it('always shows the alliance, and open commitments when they matter', () => {
    const memory = applyMemoryDelta(emptyMemory(), { alliance: 'Fewer questions', commitment: { action: 'Call Dad', when: 'Sunday' } }, { nowMs: NOW, conversationId: 'c1', commitmentId: 'r1' });
    const later = makeContext({ memory, history: [{ role: 'user', text: 'hi' }, { role: 'coach', text: 'hello' }] });
    const block = buildContextBlock(later, 'work is busy', makeAnalysis());
    expect(block).toContain('Fewer questions');
    expect(block).toContain('Be direct with me');
    expect(block).not.toContain('Call Dad');
    expect(buildContextBlock(makeContext({ memory }), 'hey', makeAnalysis())).toContain('Call Dad');
  });
});
