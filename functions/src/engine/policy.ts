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
  const voice = channel === 'voice';
  const plan = (primary: Move, why: string, secondary?: Move, targetWords = 55): MovePlan => ({
    primary,
    ...(secondary ? { secondary } : {}),
    maxQuestions: 1,
    targetWords: voice ? Math.min(targetWords, 50) : targetWords,
    why,
  });

  if (a.risk === 'crisis') return { ...plan('safety', 'possible risk to safety', undefined, 90), maxQuestions: 1 };
  if (a.intent === 'small_talk' && coachTurns === 0) {
    return p.allianceDue && !p.reflection ? plan('design_alliance', 'start of the coaching relationship', undefined, 45) : plan('open_session', 'greeting', undefined, 30);
  }
  if (a.allianceNote) return plan('design_alliance', `they said how they want to be coached: ${a.allianceNote}`, undefined, 40);
  if (a.explicitAdviceRequest) return plan('advice_with_permission', 'user explicitly asked for advice', undefined, 90);
  if (a.wantsIdeas) return plan('brainstorm', 'user wants options', undefined, 70);
  if (a.emotionalIntensity >= 2 && !a.insightMoment) {
    if (a.intent === 'vent') return plan('clearing', `venting (${a.emotions.join(', ') || 'unspecified'})`, undefined, 35);
    return plan('acknowledge_and_explore', `strong emotion (${a.emotions.join(', ') || 'unspecified'})`, undefined, 50);
  }
  if (a.intent === 'closing') return plan('close_with_inquiry', 'they are wrapping up', undefined, 40);
  if (a.insightMoment) return plan('deepen_insight', 'user voiced a realisation', 'move_to_action');
  if (a.resistance || a.intent === 'push_back') return plan('explore_resistance', 'user is pushing back');
  if (a.innerCritic) return plan('name_inner_critic', `inner critic: ${a.innerCritic}`);
  if (a.contradiction) return plan('name_contradiction', 'contradiction with earlier statements');
  if (a.progressOutcome === 'kept') return plan('acknowledge', 'they kept a commitment');
  if (a.progressOutcome || a.intent === 'report_progress' || a.stage === 'accountability') return plan('accountability_check', 'user reporting on a commitment');
  if (a.commitmentStated) {
    return a.playingSmall && coachTurns >= 2 ? plan('make_request', 'commitment is smaller than what they want') : plan('secure_commitment', 'user stated an intention');
  }
  if (a.storytelling) return plan('bottom_line', 'long story, essence unclear', undefined, 40);
  if (a.assumptions.length > 0 && coachTurns >= 1) return plan('challenge_assumption', `assumption: ${a.assumptions[0]}`);
  if (a.pattern && coachTurns >= 2) return plan('offer_intuition', `pattern: ${a.pattern}`);
  if (a.singlePerspective) return plan('explore_perspectives', 'stuck in one way of seeing it');
  if (a.intent === 'decide' && coachTurns < 2) return plan('explore_values', 'a decision: find what matters first');
  if (a.stage === 'options' || a.stage === 'commitment') return plan('move_to_action', 'user is weighing options');
  if (a.stage === 'wants') return plan('clarify_want', 'user is talking about what they want');
  // Several exploratory turns in a row: start moving forward instead of circling.
  if (coachTurns >= 4 && exploratoryStreak(history) >= 4) {
    return plan(LATE_STAGES.has(a.stage) ? 'move_to_action' : 'clarify_want', 'exploration has run for several turns');
  }
  if (a.intent === 'small_talk') return plan('open_session', 'light chat', undefined, 30);
  if (coachTurns === 0 && a.emotionalIntensity <= 1 && /^(stuck|lost)$/.test(a.emotions[0] ?? '')) {
    return plan('powerful_question', 'feeling stuck at the start');
  }
  if (a.unspoken && coachTurns >= 2) return plan('offer_intuition', `something unsaid: ${a.unspoken}`);
  return plan('reflect_and_deepen', 'default: understand and explore');
}
