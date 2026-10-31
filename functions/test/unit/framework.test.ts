import { describe, expect, it } from 'vitest';

import { groundInLatest, heuristicAnalysis } from '../../src/engine/analysis.js';
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

describe('pacing (from real Groq conversations)', () => {
  const coach = (text: string, move: string): HistoryMessage => ({ role: 'coach', text, move });
  const user = (text: string): HistoryMessage => ({ role: 'user', text });

  it('clears once, then meets the feeling another way', () => {
    const vent = makeAnalysis({ intent: 'vent', emotionalIntensity: 2 });
    expect(selectMoves(vent, [user('x'), coach('That is a lot.', 'clearing')], 'text').primary).not.toBe('clearing');
  });

  it('puts an insight, a commitment or the inner critic ahead of moderate feeling', () => {
    const feeling = { intent: 'vent' as const, emotionalIntensity: 2 as const };
    expect(selectMoves(makeAnalysis({ ...feeling, innerCritic: "I'll sound stupid" }), turns(1), 'text').primary).toBe('name_inner_critic');
    expect(selectMoves(makeAnalysis({ ...feeling, commitmentStated: true }), turns(1), 'text').primary).toBe('secure_commitment');
  });

  it("doesn't mistake their own plan for a coaching preference", () => {
    expect(selectMoves(makeAnalysis({ allianceNote: 'speak up', commitmentStated: true }), turns(2), 'text').primary).toBe('secure_commitment');
  });

  it('stops asking after two questions in a row, and moves on after two exploring turns', () => {
    const asked = [user('a'), coach('What matters here?', 'reflect_and_deepen'), user('b'), coach('What would change?', 'reflect_and_deepen')];
    const next = selectMoves(makeAnalysis(), asked, 'text');
    expect(next.primary).toBe('clarify_want');
    const landed = selectMoves(makeAnalysis({ emotionalIntensity: 2 }), asked, 'text');
    expect(landed.primary).toBe('acknowledge_and_explore');
    expect(landed.maxQuestions).toBe(0);
  });

  it('blocks a question when the plan says to let the reply land, and blocks repeated phrasing', () => {
    const profile = makeContext().profile;
    const check = (reply: string, p: MovePlan, coachTexts: string[]) =>
      checkReply({ reply, plan: p, channel: 'text', profile, userTexts: ['x'], coachTexts }).filter((i) => i.severity === 'block').map((i) => i.check);
    expect(check('That fear of a no is doing a lot of steering. What else?', { ...plan('reflect_and_deepen'), maxQuestions: 0 }, [])).toContain('questions');
    expect(check("That fear of a no is doing a lot of steering. I'd be curious where it first came from.", { ...plan('reflect_and_deepen'), maxQuestions: 0 }, [])).toEqual([]);
    expect(check('That fear of a no is doing a lot of steering.', { ...plan('reflect_and_deepen'), maxQuestions: 0 }, [])).toContain('no-invitation');
    expect(check('It sounds like money and meaning are pulling apart. What matters most?', plan('reflect_and_deepen'), ['It sounds like work is draining.'])).toContain('repetition');
    expect(check('Money and meaning are pulling apart. Which one is louder lately?', plan('reflect_and_deepen'), ['It sounds like work is draining. What do you notice?'])).toEqual([]);
  });

  it('treats "You\'re noticing / seeing / assuming" openings as one formula', () => {
    const profile = makeContext().profile;
    const blocks = (reply: string, coachTexts: string[]) =>
      checkReply({ reply, plan: plan('reflect_and_deepen'), channel: 'text', profile, userTexts: ['x'], coachTexts }).filter((i) => i.severity === 'block').map((i) => i.check);
    expect(blocks("You're seeing the money as a safety net. What would meaning look like?", ["You're noticing a gap between pay and purpose."])).toContain('repetition');
    expect(blocks('The money is a safety net, and something else is calling. What would meaning look like?', ["You're noticing a gap between pay and purpose."])).toEqual([]);
    expect(blocks('What do you notice in your body when the form opens?', ['Something stops you. What do you feel in your body?'])).toContain('repetition');
    expect(blocks("You're sensing the work doesn't fit. It sounds like purpose is missing. What used to spark you?", [])).toContain('repetition');
    expect(blocks('Meaning matters more than pay now. What would a good day look like, and how different would you feel from today?', [])).toContain('questions');
    expect(blocks('Meaning matters more than pay now. What would a good day there look like?', [])).toEqual([]);
  });

  it('never asks two questions in a row on reflective turns, and never asks about the body', () => {
    const afterQuestion = selectMoves(makeAnalysis(), [user('a'), coach('What matters here?', 'reflect_and_deepen')], 'text');
    expect(afterQuestion.primary).toBe('reflect_and_deepen');
    expect(afterQuestion.maxQuestions).toBe(0);
    const afterStatement = selectMoves(makeAnalysis(), [user('a'), coach('That sounds hard.', 'reflect_and_deepen')], 'text');
    expect(afterStatement.maxQuestions).toBe(1);
    const profile = makeContext().profile;
    const blocks = (reply: string) =>
      checkReply({ reply, plan: plan('acknowledge_and_explore'), channel: 'text', profile, userTexts: ['x'] }).filter((i) => i.severity === 'block').map((i) => i.check);
    expect(blocks('That sounds heavy. What do you notice in your body right now?')).toContain('body');
    expect(blocks('Notice what comes up when the deadline feels near.')).toContain('instructing');
    expect(blocks('That fear makes sense. Maybe you could choose one very small action, like writing the first sentence.')).toContain('suggesting');
    expect(blocks('Weeks of it sitting there. I wonder what would feel different if you took one small step.')).toContain('premature-action');
  });

  it("only flags what's in the latest message, and never uses unsaid things as proof", () => {
    const stale = makeAnalysis({ innerCritic: "I'll feel stupid for trying", assumptions: ["they'll say no"] });
    const grounded = groundInLatest(stale, "I keep putting off applying for the course. It's been weeks.");
    expect(grounded.innerCritic).toBeNull();
    expect(grounded.assumptions).toEqual([]);
    expect(groundInLatest(makeAnalysis({ allianceNote: 'gentler' }), "My dad always said I wasn't the academic one.").allianceNote).toBeNull();
    expect(groundInLatest(makeAnalysis({ allianceNote: 'fewer questions' }), 'Can you ask fewer questions please').allianceNote).toBe('fewer questions');
    expect(groundInLatest(stale, "I'm scared I'll feel stupid for trying").innerCritic).toBe("I'll feel stupid for trying");
    const profile = makeContext().profile;
    const blocks = (reply: string, userTexts: string[]) =>
      checkReply({ reply, plan: plan('name_inner_critic'), channel: 'text', profile, userTexts }).filter((i) => i.severity === 'block').map((i) => i.check);
    const said = ["My dad always said I wasn't the academic one."];
    expect(blocks("That's an old line to carry. You've already started BYT and are pushing yourself at the gym. I'd be curious what you make of it.", said)).toContain('borrowed-evidence');
    expect(blocks("That's an old line to carry, and it still stings. I'd be curious what you'd say back to it now.", said)).toEqual([]);
  });

  it('speaks plainly, never like an analyst, and never tells them what they notice', () => {
    const profile = makeContext().profile;
    const blocks = (reply: string, move: Move = 'reflect_and_deepen') =>
      checkReply({ reply, plan: plan(move), channel: 'text', profile, userTexts: ['x'] }).filter((i) => i.severity === 'block').map((i) => i.check);
    expect(blocks('Feeling foolish touches on your desire to be authentic and valued. I wonder what that brings up.')).toContain('analytical');
    expect(blocks('The course has become a stand-in for that old story. I wonder what it would mean to send it.')).toContain('analytical');
    expect(blocks('That clash between growth and safety is holding it back. I wonder where it started.')).toContain('analytical');
    expect(blocks("Part of you wants this and part of you doesn't. I wonder which feels louder.", 'name_contradiction')).not.toContain('analytical');
    expect(blocks("You're noticing the fear is about feeling foolish. I'd be curious what that's like.")).toContain('noticing');
    expect(blocks("You don't want to feel silly for trying, and that makes sense. I'd be curious what a no would mean to you.")).toEqual([]);
  });

  it("calls things by their words, not a goal's title", () => {
    const profile = makeContext().profile;
    const said = ["I keep putting off applying for the course. It's been weeks."];
    const blocks = (reply: string) =>
      checkReply({ reply, plan: plan('reflect_and_deepen'), channel: 'text', profile, userTexts: said, goalTitles: ['Apply to university'] })
        .filter((i) => i.severity === 'block')
        .map((i) => i.check);
    expect(blocks("Weeks of carrying the university application around. I wonder what's on the line for you.")).toContain('renamed');
    expect(blocks("Weeks of carrying the course around, wanting to apply. I wonder what's on the line for you.")).toEqual([]);
  });

  it('follows a stated want, steps forward when they lean in, and never challenges twice running', () => {
    const challenged = [user('a'), coach('You sound certain. What do you actually know?', 'challenge_assumption')];
    expect(selectMoves(makeAnalysis({ stage: 'wants', assumptions: ['it pays less'] }), challenged, 'text').primary).toBe('clarify_want');
    expect(selectMoves(makeAnalysis({ stage: 'commitment', assumptions: ['one form'] }), challenged, 'text').primary).toBe('move_to_action');
    expect(selectMoves(makeAnalysis({ assumptions: ["they'll say no"] }), challenged, 'text').primary).not.toBe('challenge_assumption');
    const ctx = makeContext({ history: challenged });
    expect(heuristicAnalysis("If I knew it was one form tonight, I could do that.", ctx).stage).toBe('commitment');
    expect(heuristicAnalysis('What I actually want is work that means something.', ctx).stage).toBe('wants');
    // A fear is not a plan, even with "I'll" in it.
    const fear = heuristicAnalysis("I think I'm scared they'll say no and then I'll feel stupid for trying.", ctx);
    expect(fear.commitmentStated).toBe(false);
    expect(fear.innerCritic).toBeTruthy();
    expect(heuristicAnalysis("I'll email the admissions team on Friday.", ctx).commitmentStated).toBe(true);
  });
});

describe('no instructions or empty praise', () => {
  const profile = makeContext().profile;
  const run = (reply: string, move: Move) =>
    checkReply({ reply, plan: plan(move), channel: 'text', profile, userTexts: ['x'] }).filter((i) => i.severity === 'block').map((i) => i.check);

  it('blocks a plan handed to them, "how about…" and a bare "Great."', () => {
    expect(run('Great. For the next stand-up, write it down beforehand. When will you do it?', 'secure_commitment')).toEqual(expect.arrayContaining(['praise', 'instructing']));
    expect(run('How about committing to one point per meeting? What fits?', 'secure_commitment')).toContain('leading-question');
    expect(run('One small thing at the next stand-up. Which moment will you pick?', 'secure_commitment')).toEqual([]);
  });

  it('still lets an asked-for perspective or a request be phrased as an option', () => {
    expect(run('Try weighing it on which life you want in two years. What does your gut say?', 'advice_with_permission')).toEqual([]);
  });
});
