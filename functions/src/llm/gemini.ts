import { ApiError, GoogleGenAI, ThinkingLevel as GenAiThinking } from '@google/genai';

import { LlmError, type LlmClient, type LlmRequest, type LlmResponse, type ThinkingLevel } from './types.js';

const THINKING: Record<ThinkingLevel, GenAiThinking> = {
  minimal: GenAiThinking.MINIMAL,
  low: GenAiThinking.LOW,
  medium: GenAiThinking.MEDIUM,
  high: GenAiThinking.HIGH,
};

/** Gemini 2.x models predate thinking levels; they get a token budget instead. */
const BUDGET: Record<ThinkingLevel, number> = { minimal: 0, low: 512, medium: 2048, high: 8192 };

function classify(error: unknown): LlmError {
  if (error instanceof LlmError) return error;
  if (error instanceof Error && (error.name === 'AbortError' || /aborted|timeout/i.test(error.message))) {
    return new LlmError('Model request timed out', 'timeout');
  }
  if (error instanceof ApiError) {
    if (error.status === 429) return new LlmError('Model rate limited', 'rate-limit');
    if (error.status === 400 || error.status === 404) return new LlmError(`Model request rejected (${error.status})`, 'config');
    if (error.status === 401 || error.status === 403) return new LlmError('Model credentials rejected', 'config');
    return new LlmError(`Model server error (${error.status})`, 'server');
  }
  return new LlmError('Model request failed', 'server');
}

export class GeminiClient implements LlmClient {
  readonly name = 'gemini';
  private readonly ai: GoogleGenAI;

  constructor(apiKey: string) {
    if (!apiKey) throw new LlmError('GEMINI_API_KEY is not set', 'config');
    this.ai = new GoogleGenAI({ apiKey });
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
        const legacy = /^gemini-2\./.test(req.model);
        const response = await this.ai.models.generateContent({
          model: req.model,
          contents: req.messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
          config: {
            systemInstruction: req.system,
            abortSignal: controller.signal,
            ...(req.maxOutputTokens ? { maxOutputTokens: req.maxOutputTokens } : {}),
            ...(req.jsonSchema ? { responseMimeType: 'application/json', responseJsonSchema: req.jsonSchema } : {}),
            ...(req.thinking
              ? { thinkingConfig: legacy ? { thinkingBudget: BUDGET[req.thinking] } : { thinkingLevel: THINKING[req.thinking] } }
              : {}),
          },
        });
        const text = response.text ?? '';
        if (!text.trim()) {
          const reason = response.candidates?.[0]?.finishReason;
          throw new LlmError(`Empty model response (${reason ?? 'unknown'})`, reason === 'SAFETY' ? 'blocked' : 'bad-response');
        }
        return {
          text,
          model: req.model,
          latencyMs: Date.now() - started,
          inputTokens: response.usageMetadata?.promptTokenCount,
          outputTokens: (response.usageMetadata?.candidatesTokenCount ?? 0) + (response.usageMetadata?.thoughtsTokenCount ?? 0),
        };
      } catch (error) {
        lastError = classify(error);
        if (lastError.kind === 'config' || lastError.kind === 'blocked') throw lastError;
        if (attempt === 0) await new Promise((r) => setTimeout(r, lastError!.kind === 'rate-limit' ? 1000 : 300));
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError ?? new LlmError('Model request timed out', 'timeout');
  }
}
