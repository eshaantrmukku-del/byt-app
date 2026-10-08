import type { CoachContextData, TurnAnalysis } from '../src/engine/types.js';

export function makeContext(over: Partial<CoachContextData> = {}): CoachContextData {
  return {
    today: '2026-10-04',
    profile: {
      displayName: 'Sam Patel',
      dateOfBirth: '2000-05-01',
      profession: 'Junior software developer at a fintech startup',
      goalsSummary: 'Get into a masters programme and feel more confident at work',
      income: '£32k',
      lifestyle: 'Lives with flatmates in Manchester, plays five-a-side football',
      struggles: 'Procrastination and fear of being judged',
      coachNotes: 'Be direct with me',
    },
    goals: [
      { id: 'g1', title: 'Apply for masters programmes', category: 'learning', status: 'active', progress: 20 },
      { id: 'g2', title: 'Run a half marathon', category: 'fitness', status: 'active', progress: 50 },
    ],
    checkIns: [],
    journal: [],
    history: [],
    historyTotal: 0,
    summaryMessageCount: 0,
    mode: 'normal',
    ...over,
  };
}

export function makeAnalysis(over: Partial<TurnAnalysis> = {}): TurnAnalysis {
  return {
    emotions: [],
    emotionalIntensity: 0,
    topic: 'general',
    stage: 'exploring',
    intent: 'share',
    explicitAdviceRequest: false,
    insightMoment: false,
    commitmentStated: false,
    resistance: false,
    contradiction: null,
    assumptions: [],
    values: [],
    keyPhrase: '',
    risk: 'none',
    relevantGoalIds: [],
    useCheckIns: false,
    useJournal: false,
    referencesPastSession: false,
    goalProgressReported: null,
    ...over,
  };
}
