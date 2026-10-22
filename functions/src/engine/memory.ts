import type { CoachMemory, Commitment, CommitmentStatus, MemoryDelta, MovePlan, TurnAnalysis } from './types.js';

const MAX_ALLIANCE = 6;
const MAX_VALUES = 8;
const MAX_COMMITMENTS = 12;
/** Ask how they want to be coached at most this often. */
export const ALLIANCE_REASK_MS = 60 * 86_400_000;

export const emptyMemory = (): CoachMemory => ({ alliance: [], allianceAskedAt: null, bigAgenda: null, values: [], commitments: [] });

const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const STATUSES: CommitmentStatus[] = ['open', 'kept', 'partial', 'missed'];

/** Reads a stored memory document defensively; anything malformed is dropped. */
export function readMemory(raw: unknown): CoachMemory {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    alliance: list(r.alliance).map((a) => str(a, 160)).filter((a): a is string => Boolean(a)).slice(-MAX_ALLIANCE),
    allianceAskedAt: typeof r.allianceAskedAt === 'number' ? r.allianceAskedAt : null,
    bigAgenda: str(r.bigAgenda, 400),
    values: list(r.values)
      .map((v) => v as { name?: unknown; count?: unknown })
      .filter((v) => typeof v.name === 'string' && typeof v.count === 'number')
      .map((v) => ({ name: (v.name as string).slice(0, 40), count: v.count as number }))
      .slice(0, MAX_VALUES),
    commitments: list(r.commitments)
      .map((c) => c as Partial<Commitment>)
      .filter((c) => typeof c.id === 'string' && typeof c.text === 'string' && STATUSES.includes(c.status as CommitmentStatus))
      .map((c) => ({
        id: c.id!,
        text: c.text!.slice(0, 160),
        when: typeof c.when === 'string' ? c.when : null,
        createdAt: typeof c.createdAt === 'number' ? c.createdAt : 0,
        status: c.status!,
        conversationId: typeof c.conversationId === 'string' ? c.conversationId : '',
      }))
      .slice(-MAX_COMMITMENTS),
  };
}

export const openCommitments = (memory: CoachMemory | undefined) => (memory?.commitments ?? []).filter((c) => c.status === 'open');

/** Whether this person has never been asked (recently) how they want to be coached. */
export function allianceDue(memory: CoachMemory | undefined, nowMs: number): boolean {
  if (memory?.alliance.length) return false;
  return !memory?.allianceAskedAt || nowMs - memory.allianceAskedAt > ALLIANCE_REASK_MS;
}

/** What this turn teaches the coach about the person, from the analysis and the move it chose. */
export function memoryDeltaFor(analysis: TurnAnalysis, plan: MovePlan, bigAgenda?: string): MemoryDelta | undefined {
  const delta: MemoryDelta = {};
  if (analysis.allianceNote) delta.alliance = analysis.allianceNote;
  if (plan.primary === 'design_alliance') delta.allianceAsked = true;
  if (analysis.values.length) delta.values = analysis.values;
  if (analysis.commitment && (analysis.commitmentStated || plan.primary === 'secure_commitment')) delta.commitment = analysis.commitment;
  if (analysis.resolvedCommitmentId && analysis.progressOutcome) {
    delta.resolve = { id: analysis.resolvedCommitmentId, outcome: analysis.progressOutcome };
  }
  if (bigAgenda) delta.bigAgenda = bigAgenda;
  return Object.keys(delta).length ? delta : undefined;
}

/** Applies one turn's delta. Pure, so the server can run it inside a transaction. */
export function applyMemoryDelta(
  memory: CoachMemory,
  delta: MemoryDelta,
  p: { nowMs: number; conversationId: string; commitmentId: string },
): CoachMemory {
  const next: CoachMemory = { ...memory, alliance: [...memory.alliance], values: [...memory.values], commitments: [...memory.commitments] };
  if (delta.alliance) {
    const note = delta.alliance.trim().slice(0, 160);
    if (!next.alliance.some((a) => a.toLowerCase() === note.toLowerCase())) next.alliance = [...next.alliance, note].slice(-MAX_ALLIANCE);
  }
  if (delta.allianceAsked) next.allianceAskedAt = p.nowMs;
  for (const raw of delta.values ?? []) {
    const name = raw.trim().toLowerCase().slice(0, 40);
    if (!name) continue;
    const found = next.values.find((v) => v.name === name);
    if (found) next.values = next.values.map((v) => (v === found ? { ...v, count: v.count + 1 } : v));
    else next.values = [...next.values, { name, count: 1 }];
  }
  next.values = next.values.sort((a, b) => b.count - a.count).slice(0, MAX_VALUES);
  if (delta.resolve) {
    next.commitments = next.commitments.map((c) => (c.id === delta.resolve!.id ? { ...c, status: delta.resolve!.outcome } : c));
  }
  if (delta.commitment && !next.commitments.some((c) => c.id === p.commitmentId)) {
    next.commitments = [
      ...next.commitments,
      { id: p.commitmentId, text: delta.commitment.action, when: delta.commitment.when, createdAt: p.nowMs, status: 'open' as const, conversationId: p.conversationId },
    ].slice(-MAX_COMMITMENTS);
  }
  if (delta.bigAgenda) next.bigAgenda = delta.bigAgenda.trim().slice(0, 400);
  return next;
}
