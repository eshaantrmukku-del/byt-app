import { CONTEXT, MODELS, TIMEOUTS } from '../config.js';
import type { GoalProgressProposal } from '../contract.js';
import { LlmError, parseJson, type LlmClient, type LlmMessage, type ThinkingLevel } from '../llm/types.js';
import { ANALYSIS_SCHEMA, ANALYSIS_SYSTEM, buildAnalysisPrompt, heuristicAnalysis, normaliseAnalysis } from './analysis.js';
import { buildContextBlock } from './context.js';
import { checkReply, hasBlocking, sanitiseReply } from './guard.js';
import { selectMoves } from './policy.js';
import { REPLY_SCHEMA, buildReplyMessages, buildReplySystem, critiquePrompt } from './prompt.js';
import { updateSummary } from './summarise.js';
import type { EngineInput, EngineResult, GuardIssue, TurnAnalysis } from './types.js';

export type EngineOptions = {
  models?: Partial<Record<'analysis' | 'reply' | 'summary', string>>;
  replyThinking?: ThinkingLevel;
  /** Skip the separate analysis call and use the heuristic reading (for latency experiments). */
  skipModelAnalysis?: boolean;
};

const SAFETY_FALLBACK =
  "I'm really glad you told me. I'm an AI coach, so I can't keep you safe the way a person can, and you deserve real support right now. If you might act on these thoughts or you're in danger, please call your local emergency number. You can also talk to someone any time: Samaritans on 116 123 in the UK and Ireland, or 988 in the US. Is there someone you could reach out to right now?";

type ReplyJson = { reply?: unknown; goalProgress?: { goalId?: unknown; progress?: unknown; reason?: unknown } | null };

/**
 * One coaching turn: analyse → choose a move → assemble relevant context → reply → guard.
 * Text and voice both come through here; only the style and length budget differ.
 */
export async function runCoachingEngine(llm: LlmClient, input: EngineInput, opts: EngineOptions = {}): Promise<EngineResult> {
  const started = Date.now();
  const models = { ...MODELS, ...opts.models };
  const { text, channel } = input;
  const ctx = input.context;
  const window = ctx.history.slice(-CONTEXT.historyMessages);
  const windowCtx = { ...ctx, history: window };
  const goalIds = new Set(ctx.goals.map((g) => g.id));
  let tokensIn = 0;
  let tokensOut = 0;

  // The summary only concerns messages outside the window, so it runs alongside the turn.
  const summaryPromise = updateSummary(llm, models.summary, ctx).catch(() => undefined);

  // 1. Analysis
  const fallback = heuristicAnalysis(text, windowCtx);
  let analysis: TurnAnalysis = fallback;
  let analysisSource: 'model' | 'fallback' = 'fallback';
  let analysisMs = 0;
  if (!opts.skipModelAnalysis && fallback.risk !== 'crisis') {
    try {
      const res = await llm.generate({
        purpose: 'analysis',
        model: models.analysis,
        system: ANALYSIS_SYSTEM,
        messages: [{ role: 'user', text: buildAnalysisPrompt(text, windowCtx) }],
        jsonSchema: ANALYSIS_SCHEMA as unknown as Record<string, unknown>,
        thinking: 'low',
        maxOutputTokens: 2048,
        timeoutMs: TIMEOUTS.analysisMs,
        mockHints: { text },
      });
      analysis = normaliseAnalysis(parseJson(res.text), fallback, goalIds);
      analysisSource = 'model';
      analysisMs = res.latencyMs;
      tokensIn += res.inputTokens ?? 0;
      tokensOut += res.outputTokens ?? 0;
    } catch {
      // The heuristic reading is good enough to coach one turn; the reply call decides availability.
    }
  }

  // 2. Move selection and context
  const plan = selectMoves(analysis, window, channel);
  const contextBlock = buildContextBlock(windowCtx, text, analysis);
  const system = buildReplySystem({ plan, analysis, channel, contextBlock, today: ctx.today, mode: ctx.mode });
  const messages = buildReplyMessages(window, text);
  const recentUserTexts = [text, ...window.filter((m) => m.role === 'user').map((m) => m.text)];

  // 3. Reply (+ one guarded rewrite)
  const replyStarted = Date.now();
  const generate = async (msgs: LlmMessage[]) => {
    const res = await llm.generate({
      purpose: 'reply',
      model: models.reply,
      system,
      messages: msgs,
      jsonSchema: REPLY_SCHEMA as unknown as Record<string, unknown>,
      thinking: opts.replyThinking ?? 'low',
      maxOutputTokens: 4096,
      timeoutMs: TIMEOUTS.replyMs,
      mockHints: { move: plan.primary, analysis, channel, text, profileName: ctx.profile.displayName },
    });
    tokensIn += res.inputTokens ?? 0;
    tokensOut += res.outputTokens ?? 0;
    const json = parseJson<ReplyJson>(res.text);
    if (typeof json.reply !== 'string' || !json.reply.trim()) throw new LlmError('Reply missing', 'bad-response');
    return { raw: res.text, reply: json.reply.trim(), goalProgress: json.goalProgress ?? null };
  };

  let draft: Awaited<ReturnType<typeof generate>>;
  try {
    draft = await generate(messages);
  } catch (error) {
    if (plan.primary === 'safety') {
      draft = { raw: '', reply: SAFETY_FALLBACK, goalProgress: null };
    } else {
      throw error;
    }
  }

  const guard = (reply: string) => checkReply({ reply, plan, channel, profile: ctx.profile, userTexts: recentUserTexts });
  let issues: GuardIssue[] = guard(draft.reply);
  let regenerated = false;
  if (hasBlocking(issues) && Date.now() - started < TIMEOUTS.replyMs) {
    try {
      const retry = await generate([
        ...messages,
        { role: 'model', text: draft.raw || JSON.stringify({ reply: draft.reply, goalProgress: null }) },
        { role: 'user', text: critiquePrompt(issues.filter((i) => i.severity === 'block')) },
      ]);
      const retryIssues = guard(retry.reply);
      const blocking = (xs: GuardIssue[]) => xs.filter((i) => i.severity === 'block').length;
      if (blocking(retryIssues) <= blocking(issues)) {
        draft = retry;
        issues = retryIssues;
        regenerated = true;
      }
    } catch {
      // Keep the first draft; it gets sanitised below.
    }
  }
  let reply = draft.reply;
  if (hasBlocking(issues)) {
    reply = sanitiseReply(reply, channel);
    issues = guard(reply);
  }
  const replyMs = Date.now() - replyStarted;

  // 4. Side effects: proposals only, the user confirms in the app.
  let proposal: GoalProgressProposal | undefined;
  const gp = draft.goalProgress;
  if (gp && typeof gp.goalId === 'string' && typeof gp.progress === 'number' && analysis.relevantGoalIds.includes(gp.goalId)) {
    const goal = ctx.goals.find((g) => g.id === gp.goalId);
    const progress = Math.max(0, Math.min(100, Math.round(gp.progress)));
    if (goal && goal.status !== 'completed' && progress !== goal.progress) {
      proposal = { goalId: gp.goalId, progress, reason: typeof gp.reason === 'string' ? gp.reason.slice(0, 200) : '' };
    }
  }

  const summary = await summaryPromise;
  return {
    reply,
    ...(proposal ? { proposal } : {}),
    ...(summary ? { summary } : {}),
    trace: {
      analysis,
      analysisSource,
      plan,
      guardIssues: issues,
      regenerated,
      models: { ...(analysisSource === 'model' ? { analysis: models.analysis } : {}), reply: models.reply },
      latencyMs: { analysis: analysisMs, reply: replyMs, total: Date.now() - started },
      tokens: { input: tokensIn, output: tokensOut },
    },
  };
}
