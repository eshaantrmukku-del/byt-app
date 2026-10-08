import type { LlmClient, LlmRequest, LlmResponse } from './types.js';

/**
 * Offline stand-in for Gemini, used by unit/emulator tests, the Functions emulator
 * (BYT_LLM_MODE=mock) and the eval harness without a key. It exercises the whole
 * pipeline deterministically; it says nothing about real coaching quality.
 *
 * Model ids:
 *  - "mock-coach": follows the selected move with templated replies.
 *  - "mock-naive": behaves like a generic assistant (lists, "you should", praise) so the
 *    eval and guard can be shown to catch it.
 *  - "mock-fail": always throws (provider outage).
 */
export class MockLlm implements LlmClient {
  readonly name = 'mock';
  calls: LlmRequest[] = [];

  constructor(private readonly opts: { failPurposes?: LlmRequest['purpose'][]; latencyMs?: number } = {}) {}

  async generate(req: LlmRequest): Promise<LlmResponse> {
    this.calls.push(req);
    if (this.opts.latencyMs) await new Promise((r) => setTimeout(r, this.opts.latencyMs));
    if (req.model === 'mock-fail' || this.opts.failPurposes?.includes(req.purpose)) {
      throw Object.assign(new Error('mock provider failure'), { name: 'LlmError', kind: 'server' });
    }
    const text = this.respond(req);
    return { text, model: req.model, latencyMs: this.opts.latencyMs ?? 1, inputTokens: 0, outputTokens: 0 };
  }

  private respond(req: LlmRequest): string {
    switch (req.purpose) {
      case 'analysis':
        // Empty object: the engine fills every field from its deterministic reading.
        return '{}';
      case 'summary': {
        const body = req.messages.map((m) => m.text).join(' ');
        return `They have been talking about ${body.slice(0, 160).replace(/\s+/g, ' ')}…`;
      }
      case 'reply':
        return JSON.stringify({ reply: req.model === 'mock-naive' ? naiveReply(req) : coachReply(req), goalProgress: null });
      default:
        return '{}';
    }
  }
}

function hint<T>(req: LlmRequest, key: string): T | undefined {
  return req.mockHints?.[key] as T | undefined;
}

function coachReply(req: LlmRequest): string {
  const isRetry = req.messages.length > 1 && /broke BYT coaching rules/.test(req.messages[req.messages.length - 1]!.text);
  const analysis = hint<{ keyPhrase?: string; emotions?: string[]; assumptions?: string[] }>(req, 'analysis') ?? {};
  const phrase = (analysis.keyPhrase ?? '').split(/\s+/).slice(-6).join(' ');
  const quoted = phrase ? `"${phrase}"` : 'What you just said';
  const emotion = analysis.emotions?.[0] ?? 'a lot';
  const voice = hint<string>(req, 'channel') === 'voice';
  const name = hint<string>(req, 'profileName');
  const move = hint<string>(req, 'move') ?? 'reflect_and_deepen';
  const replies: Record<string, string> = {
    safety:
      "I'm really glad you told me. I'm an AI coach, so I can't keep you safe the way a person can. If you might act on these thoughts, please call your local emergency number, or Samaritans on 116 123 in the UK, or 988 in the US. Are you safe right now?",
    open_session: `Hi${name ? ` ${name.split(' ')[0]}` : ''}. What would be most useful to talk about today?`,
    acknowledge_and_explore: `That sounds hard, and I'm hearing ${emotion} in it. What feels most important to say about it right now?`,
    reflect_and_deepen: `${quoted} — there seems to be a lot under that. What do you notice in yourself when you think about it?`,
    powerful_question: 'If this felt unstuck a month from now, what would be different?',
    clarify_want: "Setting aside what you think you're supposed to want, what do you actually want here?",
    challenge_assumption: `You said "${analysis.assumptions?.[0] ?? phrase}". What do you actually know there, and what are you predicting?`,
    name_contradiction: "I'm hearing two things that pull in different directions. How do they sit together for you?",
    explore_resistance: 'Fair enough, thanks for saying it plainly. What would make these conversations worth your time?',
    deepen_insight: `${quoted}. That sounds like something new. What does seeing that change for you?`,
    move_to_action: "It sounds clearer than before. What's one step you'd want to take, and by when?",
    secure_commitment: 'What exactly will that look like, and on which day will you do it?',
    accountability_check: 'Thanks for telling me how it went. What made the difference, or what got in the way?',
    advice_with_permission:
      "I can offer a perspective rather than a verdict. One option some people find useful is to start with the smallest piece that would teach them something. What feels like it would fit you?",
  };
  const reply = replies[move] ?? replies.reflect_and_deepen!;
  return voice || isRetry ? reply.replace(/["—]/g, '') : reply;
}

function naiveReply(req: LlmRequest): string {
  return [
    "Great question! You're doing amazing just by asking.",
    'Here are some tips:',
    '1. You should make a clear plan and stick to it.',
    '2. Break the task into smaller steps.',
    '3. Reward yourself when you finish.',
    `Remember, as a ${String(hint(req, 'profileName') ?? 'person')} you have what it takes! What will you do first? And how will you stay motivated?`,
  ].join('\n');
}
