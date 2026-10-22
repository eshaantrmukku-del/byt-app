import { CONTEXT, TIMEOUTS } from '../config.js';
import { parseJson, type LlmClient } from '../llm/types.js';
import type { CoachContextData, HistoryMessage } from './types.js';

const SUMMARY_SYSTEM = `You keep a coach's private notes on one ongoing coaching conversation. Update the notes so a coach could pick up the thread without rereading it. Respond with JSON {"notes": string, "bigAgenda": string | null}.
notes: 80–180 words of plain prose, third person ("They..."). Cover what they're working on, what matters to them, feelings and patterns noticed, insights they reached, commitments with any dates, and open threads. Keep their key phrases. No advice, no judgements, no lists.
bigAgenda: one sentence on the larger direction they seem to be growing towards beneath the individual topics (who they are becoming, not a task), in their terms, or null if it isn't clear yet.`;

const SUMMARY_SCHEMA = {
  type: 'object',
  properties: { notes: { type: 'string' }, bigAgenda: { type: ['string', 'null'] } },
  required: ['notes', 'bigAgenda'],
} as const;

/** Reads the JSON notes; plain text (an older or offline model) is taken as the notes. */
function readSummary(raw: string): { notes: string; bigAgenda?: string } {
  try {
    const j = parseJson<{ notes?: unknown; bigAgenda?: unknown }>(raw);
    if (typeof j.notes === 'string') return { notes: j.notes, ...(typeof j.bigAgenda === 'string' && j.bigAgenda.trim() ? { bigAgenda: j.bigAgenda.trim() } : {}) };
  } catch {
    // fall through
  }
  return { notes: raw };
}

/**
 * Messages that have left the prompt window and aren't in the rolling summary yet.
 * `ctx.history` is the loaded tail of the thread; `historyTotal` counts the whole thread.
 */
export function unsummarised(ctx: CoachContextData): { messages: HistoryMessage[]; upTo: number } {
  const windowStart = ctx.historyTotal - CONTEXT.historyMessages;
  const loadedStart = ctx.historyTotal - ctx.history.length;
  if (windowStart - ctx.summaryMessageCount < CONTEXT.summariseAfterUnsummarised) return { messages: [], upTo: ctx.summaryMessageCount };
  const from = Math.max(ctx.summaryMessageCount, loadedStart);
  return { messages: ctx.history.slice(from - loadedStart, windowStart - loadedStart), upTo: windowStart };
}

export async function updateSummary(
  llm: LlmClient,
  model: string,
  ctx: CoachContextData,
): Promise<{ text: string; messageCount: number; bigAgenda?: string; tokens: { input: number; output: number } } | undefined> {
  const { messages, upTo } = unsummarised(ctx);
  if (!messages.length) return undefined;
  const transcript = messages.map((m) => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.text}`).join('\n');
  const res = await llm.generate({
    purpose: 'summary',
    model,
    system: SUMMARY_SYSTEM,
    messages: [{ role: 'user', text: `${ctx.summary ? `Current notes:\n${ctx.summary}\n\n` : ''}New messages to fold in:\n${transcript}` }],
    jsonSchema: SUMMARY_SCHEMA as unknown as Record<string, unknown>,
    thinking: 'low',
    maxOutputTokens: 1024,
    timeoutMs: TIMEOUTS.summaryMs,
  });
  const { notes, bigAgenda } = readSummary(res.text);
  const text = notes.trim().slice(0, 2000);
  if (!text) return undefined;
  return { text, messageCount: upTo, ...(bigAgenda ? { bigAgenda: bigAgenda.slice(0, 400) } : {}), tokens: { input: res.inputTokens ?? 0, output: res.outputTokens ?? 0 } };
}
