import { CONTEXT, TIMEOUTS } from '../config.js';
import type { LlmClient } from '../llm/types.js';
import type { CoachContextData, HistoryMessage } from './types.js';

const SUMMARY_SYSTEM = `You keep a coach's private notes on one ongoing coaching conversation. Update the notes so a coach could pick up the thread without rereading it. Write 80–180 words of plain prose, third person ("They..."). Cover: what they're working on, what matters to them, feelings and patterns noticed, insights they reached, commitments with any dates, and open threads. Keep their key phrases. No advice, no judgements, no lists.`;

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
): Promise<{ text: string; messageCount: number } | undefined> {
  const { messages, upTo } = unsummarised(ctx);
  if (!messages.length) return undefined;
  const transcript = messages.map((m) => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.text}`).join('\n');
  const res = await llm.generate({
    purpose: 'summary',
    model,
    system: SUMMARY_SYSTEM,
    messages: [{ role: 'user', text: `${ctx.summary ? `Current notes:\n${ctx.summary}\n\n` : ''}New messages to fold in:\n${transcript}` }],
    thinking: 'low',
    maxOutputTokens: 1024,
    timeoutMs: TIMEOUTS.summaryMs,
  });
  const text = res.text.trim().slice(0, 2000);
  return text ? { text, messageCount: upTo } : undefined;
}
