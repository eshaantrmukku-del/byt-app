import { LlmError, type LlmClient, type LlmRequest, type LlmResponse, type ThinkingLevel } from './types.js';

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

/** gpt-oss reasoning effort; Groq has no "minimal". */
const EFFORT: Record<ThinkingLevel, 'low' | 'medium' | 'high'> = { minimal: 'low', low: 'low', medium: 'medium', high: 'high' };

type ChatResponse = {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

function classify(status: number): LlmError {
  if (status === 429) return new LlmError('Model rate limited', 'rate-limit');
  if (status === 401 || status === 403) return new LlmError('Model credentials rejected', 'config');
  if (status === 400 || status === 404 || status === 413) return new LlmError(`Model request rejected (${status})`, 'config');
  return new LlmError(`Model server error (${status})`, 'server');
}

/** Groq's OpenAI-compatible chat API, used to compare models during development. */
export class GroqClient implements LlmClient {
  readonly name = 'groq';

  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new LlmError('GROQ_API_KEY is not set', 'config');
  }

  async generate(req: LlmRequest): Promise<LlmResponse> {
    const started = Date.now();
    const deadline = started + req.timeoutMs;
    let lastError: LlmError | undefined;
    // One retry for transient failures, only if there is time left for it.
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining < 1500) break;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), remaining);
      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          signal: controller.signal,
          headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            model: req.model,
            messages: [
              { role: 'system', content: req.system },
              ...req.messages.map((m) => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text })),
            ],
            ...(req.maxOutputTokens ? { max_completion_tokens: req.maxOutputTokens } : {}),
            ...(req.jsonSchema ? { response_format: { type: 'json_schema', json_schema: { name: req.purpose, schema: req.jsonSchema, strict: false } } } : {}),
            ...(req.thinking && /gpt-oss/.test(req.model) ? { reasoning_effort: EFFORT[req.thinking] } : {}),
          }),
        });
        if (!res.ok) throw classify(res.status);
        const data = (await res.json()) as ChatResponse;
        const text = data.choices?.[0]?.message?.content ?? '';
        if (!text.trim()) throw new LlmError(`Empty model response (${data.choices?.[0]?.finish_reason ?? 'unknown'})`, 'bad-response');
        return {
          text,
          model: req.model,
          latencyMs: Date.now() - started,
          inputTokens: data.usage?.prompt_tokens,
          outputTokens: data.usage?.completion_tokens,
        };
      } catch (error) {
        lastError =
          error instanceof LlmError
            ? error
            : error instanceof Error && error.name === 'AbortError'
              ? new LlmError('Model request timed out', 'timeout')
              : new LlmError('Model request failed', 'server');
        if (lastError.kind === 'config') throw lastError;
        if (attempt === 0) await new Promise((r) => setTimeout(r, lastError!.kind === 'rate-limit' ? 1500 : 300));
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError ?? new LlmError('Model request timed out', 'timeout');
  }
}

/** The Groq models used when testing with Groq. */
export const GROQ_MODELS = {
  reply: process.env.BYT_GROQ_REPLY_MODEL || 'openai/gpt-oss-120b',
  // The 20b model misread too many turns (insights as commitments, worry as venting).
  analysis: process.env.BYT_GROQ_ANALYSIS_MODEL || 'openai/gpt-oss-120b',
  summary: process.env.BYT_GROQ_ANALYSIS_MODEL || 'openai/gpt-oss-20b',
} as const;
