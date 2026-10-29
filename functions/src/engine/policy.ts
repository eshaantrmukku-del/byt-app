import type { Channel } from '../contract.js';
import type { HistoryMessage, Move, MovePlan, TurnAnalysis } from './types.js';

const LATE_STAGES = new Set(['wants', 'options', 'commitment', 'accountability', 'closing']);

/** Counts consecutive recent coach turns that were purely exploratory (ended in a question, no action talk). */
function exploratoryStreak(history: readonly HistoryMessage[]): number {
  let streak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i]!;
    if (m.role !== 'coach') continue;
    if (/\b(step|when will|by when|this week|commit|next)\b/i.test(m.text)) break;
    streak++;
  }
  return streak;
}

/** The coach's own recent moves, newest last. */
function recentMoves(history: readonly HistoryMessage[]): string[] {
  return history.filter((m) => m.role === 'coach' && m.move).map((m) => m.move!).slice(-3);
}

/** How many of the coach's latest replies in a row ended with a question. */
function questionStreak(history: readonly HistoryMessage[]): number {
  let streak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i]!;
    if (m.role !== 'coach') continue;
    if (!m.text.trim().endsWith('?')) break;
    streak++;
  }
  return streak;
}

/** Moves that can land as a statement; after a run of questions they must. */
const CAN_LAND_WITHOUT_QUESTION = new Set<Move>(['reflect_and_deepen', 'acknowledge_and_explore', 'deepen_insight', 'acknowledge', 'clearing']);
/** Exploring moves that shouldn't run three times in a row. */
const EXPLORING = new Set<Move>(['reflect_and_deepen', 'acknowledge_and_explore', 'clearing', 'powerful_question']);

export type PolicyContext = {
  /** They have never (recently) been asked how they want to be coached. */
  allianceDue?: boolean;
  /** A normal session, not a reflection on check-ins. */
  reflection?: boolean;
};

/**
 * Deterministic coaching-move selection. Keeping this out of the prompt makes the
 * coach's pacing testable and stops the model defaulting to "helpful assistant" mode.
 * The order encodes the framework: safety, then the alliance, then being with what's
 * here (clearing, feeling), then awareness, then forward to action and accountability.
 */
export function selectMoves(a: TurnAnalysis, history: readonly HistoryMessage[], channel: Channel, p: PolicyContext = {}): MovePlan {
  const coachTurns = history.filter((m) => m.role === 'coach').length;
  const moves = recentMoves(history);
  const last = moves[moves.length - 1];
  const voice = channel === 'voice';
  const plan = (primary: Move, why: string, secondary?: Move, targetWords = 75): MovePlan => ({
    primary,
    ...(secondary ? { secondary } : {}),
    maxQuestions: 1,
    targetWords: voice ? Math.min(targetWords, 50) : targetWords,
    why,
  });
  const chosen = choose();
  // After two questions in a row, let a reflective reply land as a statement.
  if (CAN_LAND_WITHOUT_QUESTION.has(chosen.primary) && questionStreak(history) >= 2) return { ...chosen, maxQuestions: 0, why: `${chosen.why}; no question after a run of them` };
  return chosen;

  function choose(): MovePlan {
    if (a.risk === 'crisis') return { ...plan('safety', 'possible risk to safety', undefined, 90), maxQuestions: 1 };
    if (a.intent === 'small_talk' && coachTurns === 0) {
      return p.allianceDue && !p.reflection ? plan('design_alliance', 'start of the coaching relationship', undefined, 45) : plan('open_session', 'greeting', undefined, 35);
    }
    if (a.allianceNote && !a.commitmentStated) return plan('design_alliance', `they said how they want to be coached: ${a.allianceNote}`, undefined, 45);
    if (a.explicitAdviceRequest) return plan('advice_with_permission', 'user explicitly asked for advice', undefined, 100);
    if (a.wantsIdeas) return plan('brainstorm', 'user wants options', undefined, 80);
    // Overwhelming feeling comes before anything else.
    if (a.emotionalIntensity === 3 && !a.insightMoment) return feeling();
    if (a.intent === 'closing') return plan('close_with_inquiry', 'they are wrapping up', undefined, 45);
    if (a.insightMoment) return plan('deepen_insight', 'user voiced a realisation', 'move_to_action');
    if (a.progressOutcome === 'kept') return plan('acknowledge', 'they kept a commitment');
    if (a.progressOutcome || a.intent === 'report_progress' || a.stage === 'accountability') return plan('accountability_check', 'user reporting on a commitment');
    if (a.commitmentStated) {
      return a.playingSmall && coachTurns >= 2 ? plan('make_request', 'commitment is smaller than what they want') : plan('secure_commitment', 'user stated an intention');
    }
    // "If it was one form tonight, I could do that": they're leaning in, so help them choose rather than probe.
    if (a.stage === 'commitment' && !a.innerCritic && !a.resistance) return plan('move_to_action', 'they are close to committing');
    if (a.innerCritic) return plan('name_inner_critic', `inner critic: ${a.innerCritic}`);
    if (a.resistance || a.intent === 'push_back') return plan('explore_resistance', 'user is pushing back');
    if (a.contradiction) return plan('name_contradiction', 'contradiction with earlier statements');
    if (a.emotionalIntensity === 2 && last !== 'clearing' && last !== 'acknowledge_and_explore') return feeling();
    if (a.storytelling) return plan('bottom_line', 'long story, essence unclear', undefined, 50);
    // A want they've just said out loud deserves attention before any challenge or hunch.
    if (a.stage === 'wants' && coachTurns >= 1) return plan('clarify_want', 'they named what they want');
    // One challenge at a time: two in a row feels like an argument.
    if (a.assumptions.length > 0 && coachTurns >= 1 && last !== 'challenge_assumption') return plan('challenge_assumption', `assumption: ${a.assumptions[0]}`);
    if (a.pattern && coachTurns >= 2) return plan('offer_intuition', `pattern: ${a.pattern}`);
    if (a.singlePerspective) return plan('explore_perspectives', 'stuck in one way of seeing it');
    if (a.intent === 'decide' && coachTurns < 2) return plan('explore_values', 'a decision: find what matters first');
    if (a.stage === 'options' || a.stage === 'commitment') return plan('move_to_action', 'user is weighing options');
    if (a.stage === 'wants') return plan('clarify_want', 'user is talking about what they want');
    // Several exploratory turns in a row: start moving forward instead of circling.
    if (coachTurns >= 4 && exploratoryStreak(history) >= 4) {
      return plan(LATE_STAGES.has(a.stage) ? 'move_to_action' : 'clarify_want', 'exploration has run for several turns');
    }
    if (a.intent === 'small_talk') return plan('open_session', 'light chat', undefined, 35);
    if (coachTurns === 0 && a.emotionalIntensity <= 1 && /^(stuck|lost)$/.test(a.emotions[0] ?? '')) {
      return plan('powerful_question', 'feeling stuck at the start');
    }
    if (a.unspoken && coachTurns >= 2) return plan('offer_intuition', `something unsaid: ${a.unspoken}`);
    // Don't run the same exploring move three times: offer something or look forward instead.
    if (moves.length >= 2 && moves.slice(-2).every((m) => EXPLORING.has(m as Move))) {
      if (a.unspoken || a.values.length) return plan('offer_intuition', 'exploring has run two turns; offer what you sense');
      return plan('clarify_want', 'exploring has run two turns; look forward');
    }
    return plan('reflect_and_deepen', 'default: understand and explore');
  }

  /** Strong feeling: let venting clear (once), otherwise meet the feeling and explore it. */
  function feeling(): MovePlan {
    const named = a.emotions.join(', ') || 'unspecified';
    if (a.intent === 'vent' && last !== 'clearing') return plan('clearing', `venting (${named})`, undefined, 45);
    return plan('acknowledge_and_explore', `strong emotion (${named})`, undefined, 60);
  }
}
