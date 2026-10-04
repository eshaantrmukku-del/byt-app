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

/**
 * Deterministic coaching-move selection. Keeping this out of the prompt makes the
 * coach's pacing testable and stops the model defaulting to "helpful assistant" mode.
 */
export function selectMoves(a: TurnAnalysis, history: readonly HistoryMessage[], channel: Channel): MovePlan {
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
  if (a.intent === 'small_talk' && coachTurns === 0) return plan('open_session', 'greeting', undefined, 30);
  if (a.explicitAdviceRequest) {
    return plan('advice_with_permission', 'user explicitly asked for advice', undefined, 90);
  }
  if (a.emotionalIntensity >= 2 && !a.insightMoment) {
    return plan('acknowledge_and_explore', `strong emotion (${a.emotions.join(', ') || 'unspecified'})`, undefined, 50);
  }
  if (a.insightMoment) return plan('deepen_insight', 'user voiced a realisation', 'move_to_action');
  if (a.resistance || a.intent === 'push_back') return plan('explore_resistance', 'user is pushing back');
  if (a.contradiction) return plan('name_contradiction', 'contradiction with earlier statements');
  if (a.intent === 'report_progress' || a.stage === 'accountability') return plan('accountability_check', 'user reporting on a commitment');
  if (a.commitmentStated) return plan('secure_commitment', 'user stated an intention');
  if (a.assumptions.length > 0 && coachTurns >= 1) return plan('challenge_assumption', `assumption: ${a.assumptions[0]}`);
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
  return plan('reflect_and_deepen', 'default: understand and explore');
}
