import { CONTEXT } from '../config.js';
import type { CheckInContext, CoachContextData, GoalContext, TurnAnalysis } from './types.js';

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Check-ins from the last 14 days (today inclusive). Anything older never reaches the model. */
export function recentCheckIns(checkIns: readonly CheckInContext[], today: string): CheckInContext[] {
  const from = addDays(today, -(CONTEXT.checkInDays - 1));
  return checkIns.filter((c) => c.date >= from && c.date <= today).sort((a, b) => a.date.localeCompare(b.date));
}

function age(dob: string | null | undefined, today: string): number | null {
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const [y, m, d] = dob.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
  const years = ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
  return years > 0 && years < 120 ? years : null;
}

const clip = (s: string | undefined, n: number) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

const MONEY = /\b(money|salary|pay|paid|income|afford|debt|finance|financial|rent|mortgage|savings?|raise|job|career)\b/i;

function profileBlock(ctx: CoachContextData, text: string, a: TurnAnalysis): string {
  const p = ctx.profile;
  const lines: string[] = [];
  if (p.displayName) lines.push(`Name: ${clip(p.displayName, 60)}`);
  const years = age(p.dateOfBirth, ctx.today);
  if (years) lines.push(`Age: ${years}`);
  if (p.profession) lines.push(`Work: ${clip(p.profession, 120)}`);
  if (p.goalsSummary) lines.push(`What they hope to get from coaching: ${clip(p.goalsSummary, 300)}`);
  if (p.struggles) lines.push(`Struggles they named: ${clip(p.struggles, 300)}`);
  if (p.lifestyle) lines.push(`Lifestyle: ${clip(p.lifestyle, 200)}`);
  if (p.income && (MONEY.test(text) || /financ|money|career/i.test(a.topic))) lines.push(`Income: ${clip(p.income, 80)}`);
  if (p.coachNotes) lines.push(`Notes they left for their coach (respect these): ${clip(p.coachNotes, 500)}`);
  return lines.length ? lines.join('\n') : '';
}

function goalsBlock(goals: readonly GoalContext[], a: TurnAnalysis, firstTurn: boolean): string {
  const relevant = goals.filter((g) => a.relevantGoalIds.includes(g.id));
  if (relevant.length) {
    return relevant.map((g) => `- [${g.id}] ${clip(g.title, 120)} — ${g.status}, ${g.progress}% (their own estimate)`).join('\n');
  }
  if (firstTurn) {
    const active = goals.filter((g) => g.status === 'active').slice(0, 3);
    if (active.length) return active.map((g) => `- ${clip(g.title, 120)}`).join('\n');
  }
  return '';
}

function checkInLine(c: CheckInContext): string {
  const extra = [c.reflection ? `note: "${clip(c.reflection, 160)}"` : '', c.win ? `win: "${clip(c.win, 100)}"` : ''].filter(Boolean).join('; ');
  return `${c.date}: mood ${c.moods.join('/')}, happiness ${c.happiness}/10, stress ${c.stress}/10, sleep ${c.sleep}/10${extra ? `; ${extra}` : ''}`;
}

function checkInsBlock(ctx: CoachContextData, a: TurnAnalysis): string {
  const recent = recentCheckIns(ctx.checkIns, ctx.today);
  if (!recent.length) return '';
  if (ctx.mode === 'reflection') {
    const focus = ctx.reflectionCheckInId ? recent.find((c) => c.date === ctx.reflectionCheckInId) : undefined;
    return [
      ...recent.map(checkInLine),
      focus ? `They opened this conversation from their check-in on ${focus.date}.` : '',
    ].filter(Boolean).join('\n');
  }
  if (!a.useCheckIns) return '';
  const last7 = recent.slice(-7);
  const avg = (k: 'happiness' | 'stress' | 'sleep') => (last7.reduce((s, c) => s + c[k], 0) / last7.length).toFixed(1);
  return [
    `Averages over their last ${last7.length} check-ins: happiness ${avg('happiness')}, stress ${avg('stress')}, sleep ${avg('sleep')} (out of 10).`,
    `Most recent: ${checkInLine(last7[last7.length - 1]!)}`,
  ].join('\n');
}

function journalBlock(ctx: CoachContextData, a: TurnAnalysis): string {
  if (!(a.useJournal || ctx.mode === 'reflection') || !ctx.journal.length) return '';
  return [...ctx.journal]
    .sort((x, y) => y.date.localeCompare(x.date))
    .slice(0, CONTEXT.journalEntries)
    .map((j) => `${j.date}: ${clip(j.text, CONTEXT.journalCharsPerEntry)}`)
    .join('\n');
}

/**
 * Builds the background the reply model sees. Only what is relevant to this turn is included,
 * and it is framed as background so the model uses it quietly instead of reciting it.
 */
export function buildContextBlock(ctx: CoachContextData, text: string, a: TurnAnalysis): string {
  const firstTurn = ctx.history.length === 0;
  const sections: [string, string][] = [
    ['ABOUT THEM (background from onboarding; use only if it genuinely helps this moment, never list it back)', profileBlock(ctx, text, a)],
    [firstTurn ? 'THEIR ACTIVE GOALS (background)' : 'GOALS RELEVANT TO THIS MESSAGE', goalsBlock(ctx.goals, a, firstTurn)],
    [ctx.mode === 'reflection' ? 'RECENT CHECK-INS (they came to reflect on these; last 14 days)' : 'RECENT CHECK-INS (last 14 days, relevant here)', checkInsBlock(ctx, a)],
    ['JOURNAL (private; refer to it only as they did)', journalBlock(ctx, a)],
    ['PREVIOUS SESSION (summary)', firstTurn || a.referencesPastSession ? clip(ctx.previousSessionSummary, 700) : ''],
    ['EARLIER IN THIS CONVERSATION (summary of older messages)', clip(ctx.summary, 1200)],
  ];
  return sections.filter(([, body]) => body).map(([title, body]) => `## ${title}\n${body}`).join('\n\n');
}
