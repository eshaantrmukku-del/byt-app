export type LlmPurpose = 'analysis' | 'reply' | 'summary' | 'judge' | 'simulate';

export type LlmMessage = { role: 'user' | 'model'; text: string };

export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';

export type LlmRequest = {
  purpose: LlmPurpose;
  model: string;
  system: string;
  messages: LlmMessage[];
  /** JSON Schema; when set the response text is JSON matching it. */
  jsonSchema?: Record<string, unknown>;
  thinking?: ThinkingLevel;
  maxOutputTokens?: number;
  timeoutMs: number;
  /** Structured hints for the offline mock only; never sent to a provider. */
  mockHints?: Record<string, unknown>;
};

export type LlmResponse = {
  text: string;
  model: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
};

export interface LlmClient {
  readonly name: string;
  generate(request: LlmRequest): Promise<LlmResponse>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly kind: 'timeout' | 'rate-limit' | 'server' | 'blocked' | 'bad-response' | 'config',
  ) {
    super(message);
  }
}

export function parseJson<T>(text: string): T {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new LlmError('Model returned invalid JSON', 'bad-response');
  }
}
