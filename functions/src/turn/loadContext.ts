import type { Firestore } from 'firebase-admin/firestore';

import { CONTEXT } from '../config.js';
import { userMessageId, coachMessageId } from '../contract.js';
import { refs, type ConversationState } from '../credits/ledger.js';
import { addDays } from '../engine/context.js';
import type { CheckInContext, CoachContextData, GoalContext, HistoryMessage, JournalContext } from '../engine/types.js';

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export function todayUtc(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/** Enough history for the prompt window plus a batch to fold into the summary. */
const HISTORY_LOAD = CONTEXT.historyMessages + CONTEXT.summariseAfterUnsummarised * 3;

export async function loadCoachContext(
  db: Firestore,
  p: { uid: string; conversationId: string; clientTurnId: string; conversation: ConversationState; nowMs: number },
): Promise<CoachContextData> {
  const r = refs(db, p.uid);
  const today = todayUtc(p.nowMs);
  // One day of slack for users ahead of UTC; recentCheckIns() applies the exact 14-day cut.
  const from = addDays(today, -CONTEXT.checkInDays);
  const convRef = r.conversation(p.conversationId);
  const exclude = new Set([userMessageId(p.clientTurnId), coachMessageId(p.clientTurnId)]);

  const [profileSnap, goalsSnap, checkInsSnap, journalSnap, convSnap, messagesSnap, recentConvs] = await Promise.all([
    r.user.get(),
    r.user.collection('goals').limit(30).get(),
    r.user.collection('checkIns').where('date', '>=', from).limit(20).get(),
    r.user.collection('journal').orderBy('date', 'desc').limit(CONTEXT.journalEntries).get(),
    convRef.get(),
    convRef.collection('messages').orderBy('createdAt', 'desc').limit(HISTORY_LOAD + 2).get(),
    r.user.collection('conversations').orderBy('updatedAt', 'desc').limit(4).get(),
  ]);

  const pd = profileSnap.data() ?? {};
  const goals: GoalContext[] = goalsSnap.docs.map((d) => {
    const g = d.data();
    const status = g.status === 'paused' || g.status === 'completed' ? g.status : 'active';
    return { id: d.id, title: str(g.title) ?? '', category: str(g.category) ?? 'other', status, progress: num(g.progress) };
  }).filter((g) => g.title);

  const checkIns: CheckInContext[] = checkInsSnap.docs.map((d) => {
    const c = d.data();
    return {
      date: str(c.date) ?? d.id,
      moods: Array.isArray(c.moods) ? c.moods.filter((m: unknown): m is string => typeof m === 'string') : [],
      happiness: num(c.happiness),
      stress: num(c.stress),
      sleep: num(c.sleep),
      ...(str(c.reflection) ? { reflection: str(c.reflection) } : {}),
      ...(str(c.win) ? { win: str(c.win) } : {}),
    };
  });

  const journal: JournalContext[] = journalSnap.docs
    .map((d) => ({ date: str(d.data().date) ?? '', text: str(d.data().text) ?? '' }))
    .filter((j) => j.text);

  const history: HistoryMessage[] = messagesSnap.docs
    .filter((d) => !exclude.has(d.id))
    .map((d) => ({ role: d.data().role === 'coach' ? 'coach' as const : 'user' as const, text: str(d.data().text) ?? '' }))
    .filter((m) => m.text)
    .slice(0, HISTORY_LOAD)
    .reverse();

  // messageCount already includes this turn's user message.
  const totalBefore = Math.max(history.length, num(convSnap.data()?.messageCount) - 1);
  const previous = recentConvs.docs.find((d) => d.id !== p.conversationId && str(d.data().summary));

  return {
    today,
    profile: {
      displayName: str(pd.displayName),
      dateOfBirth: str(pd.dateOfBirth) ?? null,
      profession: str(pd.profession),
      goalsSummary: str(pd.goalsSummary),
      income: str(pd.income),
      lifestyle: str(pd.lifestyle),
      struggles: str(pd.struggles),
      coachNotes: str(pd.coachNotes),
    },
    goals,
    checkIns,
    journal,
    history,
    historyTotal: totalBefore,
    ...(p.conversation.summary ? { summary: p.conversation.summary } : {}),
    summaryMessageCount: p.conversation.summaryMessageCount,
    ...(previous ? { previousSessionSummary: str(previous.data().summary) } : {}),
    mode: p.conversation.mode,
    ...(p.conversation.reflectionCheckInId ? { reflectionCheckInId: p.conversation.reflectionCheckInId } : {}),
  };
}
