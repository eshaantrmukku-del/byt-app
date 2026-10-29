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
    return { text, model: req.model, latencyMs: this.opts.latencyMs ?? 1, inputTokens: estimateTokens(req), outputTokens: Math.ceil(text.length / 4) };
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
  const analysis = hint<{ keyPhrase?: string; emotions?: string[]; assumptions?: string[]; innerCritic?: string | null; pattern?: string | null }>(req, 'analysis') ?? {};
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
    design_alliance: "I'm glad you're here. Before we start, how would you like me to be with you: more direct, more gentle, or somewhere in between?",
    clearing: `That's a lot, and I'm hearing ${emotion} in it. What else is in there?`,
    bottom_line: "There's a lot in that. What's the heart of it for you?",
    offer_intuition: `I might be off here, but I notice ${analysis.pattern ?? 'the same thing keeps coming up'}. Does that fit?`,
    explore_values: 'Underneath the options, what matters most to you here?',
    explore_perspectives: "That's one way of seeing it. If you looked at this from five years on, what else might you see?",
    name_inner_critic: `There's a voice saying "${analysis.innerCritic ?? phrase}". What is it trying to protect you from?`,
    brainstorm: "Let's build some options together. What ideas have you already half-had? I'll add a couple after yours.",
    make_request: "I have a request that stretches this a little: double it this week. You can say yes, no, or make a counter-offer.",
    acknowledge: 'You did what you said you would, and that took persistence. What did you learn about yourself doing it?',
    close_with_inquiry: 'Thanks for going there today. Something to carry this week: what are you choosing when you choose the safe option?',
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
  const statementOnly = hint<number>(req, 'maxQuestions') === 0;
  if (isRetry || statementOnly) {
    // A rewrite: a plain statement that varies with what they said, so it doesn't repeat.
    const seed = [...(hint<string>(req, 'text') ?? '')].reduce((n, c) => n + c.charCodeAt(0), 0) + req.messages.length;
    return LANDINGS[seed % LANDINGS.length]!;
  }
  const reply = replies[move] ?? replies.reflect_and_deepen!;
  return voice ? reply.replace(/["—]/g, '') : reply;
}

/** Statements the offline coach uses when it must not ask, or must say it differently. */
const LANDINGS = [
  "There is more weight in that than the words let on, and it seems to be about more than this one task. I'd be curious what sits underneath it for you.",
  "That says a lot about what matters to you here, maybe more than the plan itself. Take your time with that.",
  "Something shifted in how you put that. I wonder what made it come out that way today.",
  "Part of you already knows where this is heading, even if the rest is not ready yet. I'm here if you want to stay with it.",
  "That tension between wanting it and holding back seems to be the real thing here. I'd be curious which side feels louder right now.",
];

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

/** About four characters a token, like Gemini's own rough guide. */
function estimateTokens(req: LlmRequest): number {
  const chars = (req.system?.length ?? 0) + req.messages.reduce((n, m) => n + m.text.length, 0);
  return Math.ceil(chars / 4);
}
