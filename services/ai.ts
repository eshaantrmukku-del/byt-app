import type { ReflectionContextPayload } from '@/context/ChatsContext';
import type { CheckIn, CoachProfile, Goal } from '@/store/useStore';
import { ageFromIsoDate, formatDobDisplay } from '@/utils/dateOfBirth';

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
/** Alias that tracks Google's current flash-lite; 2.5-flash-lite is blocked for new API keys. */
const GEMINI_MODEL = 'gemini-flash-lite-latest';

export type CoachChatMode = 'normal' | 'reflection';

interface GoalUpdate {
  goalId: string;
  progressChange: number;
  reasoning: string;
}

interface NewGoal {
  title: string;
  category: string;
  reasoning: string;
}

export interface AIResponse {
  response: string;
  goalUpdates: GoalUpdate[];
  newGoals: NewGoal[];
  /** Populated for voice turns when the model returns what it heard */
  userTranscript?: string;
}

/** Compact continuity notes from older chats so the coach doesn't "forget" prior sessions. */
export function buildPastChatsMemory(
  chats: {
    id: string;
    title: string;
    mode?: string;
    messages: { text: string; sender: string; timestamp: number }[];
    updatedAt: number;
  }[],
  activeChatId?: string | null,
  maxChats = 10,
  options?: { excludeReflection?: boolean }
): string {
  const others = chats
    .filter((c) => c.id !== activeChatId && Array.isArray(c.messages) && c.messages.length > 0)
    .filter((c) => !(options?.excludeReflection && c.mode === 'reflection'))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, maxChats);

  if (others.length === 0) return '';

  const blocks = others.map((chat) => {
    // Keep a richer streak of prior conversation so the coach can personalise
    const recent = chat.messages.slice(-14);
    const lines = recent.map(
      (m) => `${m.sender === 'user' ? 'Client' : 'Coach'}: ${m.text.slice(0, 320)}`
    );
    return `Session "${chat.title}":\n${lines.join('\n')}`;
  });

  return `PRIOR SESSION MEMORY (use for continuity across chats; do not invent details that are not here):\n${blocks.join('\n\n')}`;
}

/** True when a normal-chat message is asking about a check-in, mood log, or reflection scores. */
export function userAskedAboutCheckIn(text: string): boolean {
  return /\b(check[\s-]?ins?|mood log|daily reflection|reflection scores?|how (?:have|did) i (?:feel|sleep)|my (?:mood|stress|sleep|happiness))\b/i.test(
    text
  );
}

/**
 * Check-in text for one turn. Normal openers stay empty. Reflection / Discuss always gets it.
 * A normal chat gets it only when the user asks, so it stays silent background otherwise.
 */
export function checkInMemoryForTurn(
  chatMode: CoachChatMode,
  userText: string,
  memory: string,
  isSessionOpener = false
): string {
  if (!memory.trim()) return '';
  if (chatMode === 'reflection') return memory;
  if (isSessionOpener) return '';
  return userAskedAboutCheckIn(userText) ? memory : '';
}

/** Check-ins / reflections for silent background personalisation (stale entries omitted). */
export function buildCheckInsMemory(checkIns: CheckIn[], max = 8, maxAgeDays = 14): string {
  if (!checkIns?.length) return '';
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const recent = [...checkIns]
    .filter((c) => {
      const t = new Date(c.date).getTime();
      return Number.isFinite(t) && t >= cutoff;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, max);

  if (!recent.length) return '';

  const lines = recent.map((c) => {
    const bits = [
      `Date ${c.date}`,
      c.mood ? `mood ${c.mood}` : null,
      typeof c.happiness === 'number' ? `happiness ${c.happiness}/10` : null,
      typeof c.stress === 'number' ? `stress ${c.stress}/10` : null,
      typeof c.sleep === 'number' ? `sleep ${c.sleep}/10` : null,
      c.reflection ? `reflection: ${c.reflection.slice(0, 180)}` : null,
      c.win ? `win: ${c.win.slice(0, 120)}` : null,
    ].filter(Boolean);
    return `- ${bits.join(' · ')}`;
  });

  return lines.join('\n');
}

/** Frame check-in memory for the active chat mode — silent background, never a forced topic. */
function formatCheckInsMemoryBlock(rawLines: string, chatMode: CoachChatMode): string {
  if (!rawLines?.trim()) return '';
  if (chatMode === 'reflection') {
    return `CHECK-IN DATA FOR THIS REFLECTION THREAD (draw on only when it serves the inquiry—do not recite as a laundry list):\n${rawLines}`;
  }
  return `SILENT BACKGROUND CHECK-IN DATA (never lead with this; ignore unless the client explicitly asks about a check-in, mood log, reflection scores, or similar):\n${rawLines}`;
}

/** Name-only context for normal session openers so the model cannot dump bio. */
function openerClientNameOnly(summary: string): string {
  const m = summary.match(/Client name:\s*(.+)/i);
  const name = (m?.[1]?.split('\n')[0] || 'Client').trim() || 'Client';
  return `Client name: ${name}
(Full profile, goals list, and check-in history are intentionally withheld for this opening message. Do not invent or recall bio details.)`;
}

/**
 * Continuity guidance for mid-conversation turns.
 * Profile / check-ins / goals are silent context — use when it serves the reply, never dump as topics.
 * Aligned with AI_GOAL_AWARENESS.md / AI_GOAL_CREATION.md: respond to what they say; stay natural.
 */
const MEMORY_GUIDANCE = `MEMORY & PERSONALISATION (critical):
- CLIENT CONTEXT, CURRENT GOALS, PRIOR SESSION MEMORY, and any check-in data are SILENT BACKGROUND for you—not topics to announce.
- Never recite their bio (profession, income, struggles, DOB/age, lifestyle) or dump a goals/check-in laundry list unprompted.
- When they bring something up, you may draw on background naturally—like a real coach who remembers, not a CRM reading a file.
- Treat the FULL conversation history in this thread as ground truth.
- Prefer the latest CLIENT CONTEXT if it conflicts with older chat text.
- Follow up on open loops from this thread; avoid re-asking for info they already gave here.
- Prior reflection/check-in sessions in memory are historical only—do not reopen check-in topics in a NORMAL chat unless the client brings them up.`;

/** Normal chats must not lead with or force daily check-in discussion. */
const NORMAL_CHECKIN_RULE = `DAILY CHECK-INS (critical for NORMAL chats):
- Do NOT bring up, summarize, reference, or ask about the client's daily check-in / mood log.
- Do NOT open or steer toward a check-in (today's or older)—including month-old history.
- If SILENT BACKGROUND CHECK-IN DATA is present, ignore it unless the client explicitly asks about their check-in, mood, reflection scores, or similar.
- Check-in discussion belongs in the dedicated reflection / "Discuss check-in" flow—not normal coaching chats.`;

/** First message of a new normal chat: warm human invite only — no context dumping. */
const NORMAL_OPENER_RULE = `SESSION OPENER (critical):
- Sound like a real human coach starting a live session: warm, present, brief.
- Invite conversation—what they want to work on, where they feel stuck, or how you can help.
- Do NOT mention check-ins, moods, energy, happiness/stress/sleep scores, reflections, or dated check-in history.
- Do NOT recite personal bio (profession, income, struggles, DOB, age, lifestyle, coach notes).
- Do NOT list or summarize stored goals by title. Do not acknowledge their profession or "use recent check-ins."
- No topic dumping. No CRM-style recap. Let them set the agenda.
- 2–4 natural spoken sentences. End with one open question.`;

const CTI_CORE = `You embody Co-Active coaching (CTI-style): direct, reflective, and human. You prioritize awareness and committed action. You ask sharp open-ended questions, mirror patterns, and challenge assumptions when useful. You never sound like a generic chatbot or a template.

VOICE & FORMAT (critical):
- Write exactly how a coach would SPEAK in a session—flowing sentences, not a form, memo, or chatbot script.
- Never use section titles or labels such as "COACHING CLOSE", "Insight:", "Shift:", "Next action:", "Accountability:", or markdown headings.
- No bullet lists unless the client explicitly asked for a list; prefer natural speech.
- Avoid rambling, empty praise, and clichés ("good job", "you've got this", "crushing it").
- Stay grounded, slightly challenging, and focused on real progress.
- Respond to what the client is saying in the moment—do not pivot into dumping stored profile facts.`;

const NORMAL_CLOSE_GUIDANCE = `NORMAL coaching thread: each reply should read as one continuous spoken turn.

Before you finish, naturally weave in (as normal sentences—never labeled):
1) What you see in them or the situation (insight),
2) A useful reframe or perspective shift,
3) One specific, observable next step,
4) A closing accountability question that locks ownership.

Do not announce these parts. Do not number them. It should sound like one coach talking, especially because the client may use voice.
Ground insight and next steps in what they just said—not in a recitation of stored bio or check-ins.`;

const REFLECTION_GUIDANCE = `REFLECTION thread (check-in discussion): ongoing exploration, not a session wrap-up.

- Reference their data when relevant; name patterns; stay curious.
- End with one strong open-ended question when appropriate.
- Do NOT use COACHING CLOSE or any labeled insight/shift/action/accountability blocks.
- Do not sound like you're closing the book on the conversation.`;

const FORBIDDEN_FORMATTING_NOTE = `Never output labels or blocks: COACHING CLOSE, Insight:, Shift:, Next action:, Accountability:, or ### headers.`;

/** Strip template artifacts if the model leaks them anyway. */
export function sanitizeCoachResponse(text: string): string {
  let out = text.replace(/\[CREATE_GOAL:.*?\]/g, '').trim();
  out = out.replace(/\n*#{1,6}\s*COACHING CLOSE[\s\S]*$/i, '').trim();
  out = out.replace(/\n*\s*COACHING CLOSE\s*\n[\s\S]*$/i, '').trim();
  out = out.split('\n').map((line) => {
    return line
      .replace(/^\s*[-*•]\s*(Insight|Shift|Next action|Accountability)\s*:\s*/i, '')
      .replace(/^\s*(Insight|Shift|Next action|Accountability)\s*:\s*/i, '');
  }).join('\n');
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  return out;
}

function hasForbiddenFormatting(text: string): boolean {
  if (/\bCOACHING\s+CLOSE\b/i.test(text)) return true;
  if (/^\s*(Insight|Shift|Next action|Accountability)\s*:/im.test(text)) return true;
  return false;
}

function goalsBlock(goals: Goal[]): string {
  return goals.length > 0
    ? goals.map((g) => `- "${g.title}" (${g.category}): ${g.progress}% complete, Status: ${g.status}`).join('\n')
    : 'No goals set yet.';
}

export function buildCoachProfileSummary(profile: CoachProfile | null, displayName: string): string {
  if (!profile) {
    return `Client name: ${displayName}. Extended coaching profile not completed yet—invite them to finish onboarding when relevant.`;
  }

  let ageLabel = '—';
  let dobLabel = '';
  if (profile.dateOfBirth) {
    const computed = ageFromIsoDate(profile.dateOfBirth);
    if (computed !== null) {
      ageLabel = `${computed}`;
      dobLabel = formatDobDisplay(profile.dateOfBirth);
    }
  } else if (profile.age) {
    ageLabel = profile.age;
  }

  const lines = [
    `Client name: ${displayName}`,
    `Age (auto-updated from date of birth): ${ageLabel}`,
  ];
  if (dobLabel) lines.push(`Date of birth: ${dobLabel}`);
  lines.push(
    `Profession: ${profile.profession || '—'}`,
    `Stated goals / focus: ${profile.goalsSummary || '—'}`
  );
  if (profile.income) lines.push(`Income context (optional): ${profile.income}`);
  if (profile.lifestyleNotes) lines.push(`Lifestyle: ${profile.lifestyleNotes}`);
  if (profile.struggles) lines.push(`Current struggles: ${profile.struggles}`);
  if (profile.coachNotes) lines.push(`What they want the coach to know: ${profile.coachNotes}`);
  return lines.join('\n');
}

function reflectionDataBlock(ctx: ReflectionContextPayload): string {
  return [
    `Check-in date: ${ctx.date}`,
    `Mood tag: ${ctx.mood}`,
    `Happiness / vitality (1–10): ${ctx.happiness}`,
    `Stress (1–10, higher = more stressed): ${ctx.stress}`,
    `Sleep quality (1–10): ${ctx.sleep}`,
    `Written reflection ("what's on your mind"): ${ctx.reflection || '(none)'}`,
    `Small win focus: ${ctx.win || '(none)'}`,
    `Combined notes: ${ctx.notes || '(none)'}`,
  ].join('\n');
}

function createGoalInstructions(): string {
  return `When the user wants to start something new or improve an area, you may suggest a goal using this EXACT token in your reply:
[CREATE_GOAL: title="Goal Title Here" category="Category"]
Valid categories: Health, Fitness, Career, Learning, Social, Finance, Personal, Creativity, Other
Remove nothing from the user-visible reply except we strip these tokens client-side.`;
}

export async function generateNormalSessionOpener(
  goals: Goal[],
  coachProfileSummary: string,
  variantSeed: number
): Promise<AIResponse> {
  const variants = [
    'Open by asking what they most want to move forward on in the next week, and what would make that meaningful.',
    'Open by asking where they feel most stuck right now—and what part of that is in their control.',
    'Open by asking what outcome they are avoiding defining clearly, and why that might be.',
    'Open by asking what conversation they are postponing that would unlock progress if they had it.',
    'Open by asking what they are tolerating that no longer serves them, and what clarity they need.',
    'Open by asking what they want to be true 30 days from now that is not true today.',
  ];
  const pick = variants[variantSeed % variants.length];
  const userPrompt = `You are starting a NEW normal coaching chat. Write ONLY your opening message as the coach (no meta). ${pick} Sound like a real human coach in the room: warm, brief, 2–4 natural spoken sentences, ending with one open question. Do NOT weave in insight/shift/action/accountability blocks—this is just the invite to start. Do NOT mention daily check-ins, mood logs, reflection scores, stored goals, profession, or any personal bio. ${FORBIDDEN_FORMATTING_NOTE}`;

  return getAiCoachResponse({
    userMessage: userPrompt,
    history: [],
    goals,
    chatMode: 'normal',
    coachProfileSummary: openerClientNameOnly(coachProfileSummary),
    reflectionContext: null,
    checkInsMemory: '',
    pastChatsMemory: '',
    isSessionOpener: true,
  });
}

export async function generateReflectionSessionOpener(
  goals: Goal[],
  coachProfileSummary: string,
  ctx: ReflectionContextPayload
): Promise<AIResponse> {
  const userPrompt = `You are opening a NEW reflection discussion. The client tapped "Discuss" on this check-in.

DATA:
${reflectionDataBlock(ctx)}

Your opening must:
1) Briefly reference specific numbers/words from the data (happiness, stress, sleep, written lines).
2) Name 1–2 patterns or tensions you notice across those signals.
3) Finish with exactly ONE strong open-ended coaching question.

Keep total length concise (roughly 120–220 words). Sound like a live coach, not a report. ${REFLECTION_GUIDANCE} ${FORBIDDEN_FORMATTING_NOTE}`;

  return getAiCoachResponse({
    userMessage: userPrompt,
    history: [],
    goals,
    chatMode: 'reflection',
    coachProfileSummary,
    reflectionContext: ctx,
    isSessionOpener: true,
  });
}

export interface CoachMessageParams {
  userMessage: string;
  history: { role: 'user' | 'model'; parts: { text: string }[] }[];
  goals: Goal[];
  chatMode: CoachChatMode;
  coachProfileSummary: string;
  reflectionContext?: ReflectionContextPayload | null;
  /** Compact memory from other chats for cross-session continuity */
  pastChatsMemory?: string;
  /** Recent check-ins / reflections */
  checkInsMemory?: string;
  /** Internal: opener generation uses same pipeline */
  isSessionOpener?: boolean;
}

export async function getAiCoachResponse(params: CoachMessageParams): Promise<AIResponse> {
  const {
    userMessage,
    history,
    goals,
    chatMode,
    coachProfileSummary,
    reflectionContext,
    pastChatsMemory,
    checkInsMemory,
    isSessionOpener,
  } = params;

  if (!API_KEY) {
    console.error('AI Coach: API Key is missing!');
    return {
      response: "I'm sorry, I'm not configured correctly. Please check the API key.",
      goalUpdates: [],
      newGoals: [],
    };
  }

  const goalsContext = goalsBlock(goals);
  const isNormalOpener = chatMode === 'normal' && isSessionOpener;

  const checkInsBlock = isNormalOpener ? '' : formatCheckInsMemoryBlock(checkInsMemory || '', chatMode);

  const goalsContextBlock = isNormalOpener
    ? '(Withheld for session opener—do not list or summarize goals.)'
    : goalsContext;

  const memoryGuidanceBlock = isNormalOpener ? NORMAL_OPENER_RULE : MEMORY_GUIDANCE;

  const modeBlock =
    chatMode === 'reflection'
      ? `${REFLECTION_GUIDANCE}

Reflection thread context (keep confidential to this session):
${reflectionContext ? reflectionDataBlock(reflectionContext) : 'No structured reflection payload attached.'}

${isSessionOpener ? 'This is the first message of the thread.' : 'Continue the reflective inquiry.'}`
      : isNormalOpener
        ? `${NORMAL_OPENER_RULE}

This is the first message of a new NORMAL chat. Invite them in—nothing else.`
        : `${NORMAL_CLOSE_GUIDANCE}

${NORMAL_CHECKIN_RULE}

This is a continuing NORMAL chat.`;

  const systemPrompt = `${CTI_CORE}

CLIENT CONTEXT:
${coachProfileSummary}

CURRENT GOALS:
${goalsContextBlock}

${!isNormalOpener && pastChatsMemory ? `${pastChatsMemory}\n\n` : ''}${checkInsBlock ? `${checkInsBlock}\n\n` : ''}${memoryGuidanceBlock}

${!isNormalOpener ? `${createGoalInstructions()}\n\n` : ''}CHAT MODE: ${chatMode.toUpperCase()}
${modeBlock}`;

  const runGenerate = async (instructionOverride?: string) => {
    const sys = instructionOverride ? `${systemPrompt}\n\nADDITIONAL: ${instructionOverride}` : systemPrompt;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            ...history,
            {
              role: 'user',
              parts: [{ text: userMessage }],
            },
          ],
          systemInstruction: { parts: [{ text: sys }] },
          generationConfig: {
            temperature: 0.65,
            topK: 40,
            topP: 0.92,
            maxOutputTokens: 900,
          },
        }),
      }
    );
    const data = await response.json();
    if (data.error) {
      console.error('Gemini API Error:', data.error);
      throw new Error(data.error.message || 'API Error');
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error('Unexpected Gemini Response:', data);
      throw new Error('empty');
    }
    return text as string;
  };

  try {
    let aiResponse = await runGenerate();

    if (hasForbiddenFormatting(aiResponse)) {
      aiResponse = await runGenerate(
        'Rewrite as one natural spoken coaching turn. Remove ALL section labels (COACHING CLOSE, Insight:, Shift:, Next action:, Accountability:, bullets used as a form). Keep the same coaching content woven into conversational sentences.'
      );
    }

    const newGoals = extractGoalCreations(aiResponse);
    aiResponse = sanitizeCoachResponse(aiResponse);

    const goalUpdates = isSessionOpener ? [] : analyzeForGoalUpdates(userMessage, goals);

    return {
      response: aiResponse,
      goalUpdates,
      newGoals,
    };
  } catch (error) {
    console.error('AI Coaching Error:', error);
    return {
      response: "I'm having a bit of trouble connecting right now. Let's try that again in a moment.",
      goalUpdates: [],
      newGoals: [],
    };
  }
}

function extractGoalCreations(aiResponse: string): NewGoal[] {
  const newGoals: NewGoal[] = [];
  const goalRegex = /\[CREATE_GOAL:\s*title="([^"]+)"\s*category="([^"]+)"\]/g;

  let match;
  while ((match = goalRegex.exec(aiResponse)) !== null) {
    newGoals.push({
      title: match[1],
      category: match[2],
      reasoning: 'AI Coach suggested this goal based on your conversation',
    });
  }

  return newGoals;
}

function analyzeForGoalUpdates(userMessage: string, goals: Goal[]): GoalUpdate[] {
  const updates: GoalUpdate[] = [];
  const lowerMessage = userMessage.toLowerCase();

  if (lowerMessage.match(/\b(meditat(e|ed|ing)|mindful(ness)?|breathing exercise|yoga)\b/)) {
    const meditationGoal = goals.find(
      (g) =>
        g.title.toLowerCase().includes('meditat') ||
        g.title.toLowerCase().includes('mindful') ||
        g.category.toLowerCase().includes('health')
    );
    if (meditationGoal && meditationGoal.progress < 100) {
      updates.push({ goalId: meditationGoal.id, progressChange: 8, reasoning: 'Completed meditation session' });
    }
  }

  if (lowerMessage.match(/\b(gym|workout|exercise|lift(ed|ing)?|run(ning)?|cardio|training)\b/)) {
    const fitnessGoal = goals.find(
      (g) =>
        g.title.toLowerCase().includes('gym') ||
        g.title.toLowerCase().includes('fitness') ||
        g.title.toLowerCase().includes('workout') ||
        g.category.toLowerCase().includes('fitness')
    );
    if (fitnessGoal && fitnessGoal.progress < 100) {
      updates.push({ goalId: fitnessGoal.id, progressChange: 10, reasoning: 'Completed workout session' });
    }
  }

  if (lowerMessage.match(/\b(portfolio|project|work(ed|ing)?|code|develop(ed|ing)?|design(ed|ing)?|launch(ed)?|ship(ped)?)\b/)) {
    const careerGoal = goals.find(
      (g) =>
        g.title.toLowerCase().includes('portfolio') ||
        g.title.toLowerCase().includes('career') ||
        g.title.toLowerCase().includes('project') ||
        g.category.toLowerCase().includes('career')
    );
    if (careerGoal && careerGoal.progress < 100) {
      updates.push({ goalId: careerGoal.id, progressChange: 5, reasoning: 'Made progress on career goal' });
    }
  }

  if (lowerMessage.match(/\b(read|reading|book|learn(ed|ing)?|study|course|article)\b/)) {
    const learningGoal = goals.find(
      (g) =>
        g.title.toLowerCase().includes('read') ||
        g.title.toLowerCase().includes('learn') ||
        g.category.toLowerCase().includes('learning')
    );
    if (learningGoal && learningGoal.progress < 100) {
      updates.push({ goalId: learningGoal.id, progressChange: 7, reasoning: 'Engaged in learning activity' });
    }
  }

  if (lowerMessage.match(/\b(network(ing)?|connect(ed|ion)?|meeting|coffee chat|reach(ed)? out)\b/)) {
    const networkingGoal = goals.find(
      (g) =>
        g.title.toLowerCase().includes('network') ||
        g.title.toLowerCase().includes('connect') ||
        g.category.toLowerCase().includes('social')
    );
    if (networkingGoal && networkingGoal.progress < 100) {
      updates.push({ goalId: networkingGoal.id, progressChange: 6, reasoning: 'Made networking progress' });
    }
  }

  return updates;
}

export const getAiVoiceResponse = async (
  audioBase64: string,
  history: { role: 'user' | 'model'; parts: { text: string }[] }[],
  goals: Goal[],
  coachProfileSummary: string,
  chatMode: CoachChatMode = 'normal',
  pastChatsMemory = '',
  checkInsMemory = ''
): Promise<AIResponse> => {
  if (!API_KEY) {
    return {
      response: "I'm sorry, I'm not configured correctly. Please check the API key.",
      goalUpdates: [],
      newGoals: [],
    };
  }

  const goalsContext = goalsBlock(goals);
  const checkInsBlock = formatCheckInsMemoryBlock(checkInsMemory || '', chatMode);

  const modeVoice =
    chatMode === 'reflection'
      ? `${REFLECTION_GUIDANCE} Keep voice replies short (often 2–4 sentences).`
      : `${NORMAL_CLOSE_GUIDANCE} ${NORMAL_CHECKIN_RULE} Keep voice replies short (often 2–4 sentences); weave close elements into speech, never as labels.`;

  const systemPrompt = `${CTI_CORE}

CLIENT CONTEXT:
${coachProfileSummary}

CURRENT GOALS:
${goalsContext}

${pastChatsMemory ? `${pastChatsMemory}\n\n` : ''}${checkInsBlock ? `${checkInsBlock}\n\n` : ''}${MEMORY_GUIDANCE}

This is a VOICE call turn. You are speaking aloud—sound like a real coach in the room. No lists, no headers, no template language. ${createGoalInstructions()}

CHAT MODE: ${chatMode.toUpperCase()}
${modeVoice}
${FORBIDDEN_FORMATTING_NOTE}

RESPONSE FORMAT (required):
Return ONLY valid JSON with two string fields:
{"heard":"<what the client said, concise transcript>","reply":"<your spoken coach reply>"}
Do not wrap in markdown.`;

  try {
    const modelName = GEMINI_MODEL;
    const requestBody = {
      contents: [
        ...history,
        {
          role: 'user',
          parts: [{ inlineData: { mimeType: 'audio/mp4', data: audioBase64 } }],
        },
      ],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        temperature: 0.65,
        topK: 40,
        topP: 0.92,
        maxOutputTokens: 900,
      },
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      }
    );

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message || 'API Error');
    }
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      const raw = data.candidates[0].content.parts[0].text as string;
      const parsed = parseVoiceJson(raw);
      if (parsed) {
        const reply = sanitizeCoachResponse(parsed.reply);
        const newGoals = extractGoalCreations(reply);
        return {
          response: reply,
          goalUpdates: [],
          newGoals,
          userTranscript: parsed.heard.trim() || undefined,
        };
      }
      let aiResponse = sanitizeCoachResponse(raw);
      const newGoals = extractGoalCreations(aiResponse);
      return { response: aiResponse, goalUpdates: [], newGoals };
    }
    return { response: "I didn't catch that. Could you say it again?", goalUpdates: [], newGoals: [] };
  } catch (error) {
    console.error('AI Voice Coaching Error:', error);
    return { response: "I'm having trouble hearing you. Please try again.", goalUpdates: [], newGoals: [] };
  }
};

function parseVoiceJson(raw: string): { heard: string; reply: string } | null {
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  try {
    const obj = JSON.parse(cleaned) as { heard?: unknown; reply?: unknown };
    if (typeof obj.reply === 'string' && obj.reply.trim()) {
      return {
        heard: typeof obj.heard === 'string' ? obj.heard : '',
        reply: obj.reply,
      };
    }
  } catch {
    const heardMatch = cleaned.match(/"heard"\s*:\s*"((?:\\.|[^"\\])*)"/);
    const replyMatch = cleaned.match(/"reply"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (replyMatch?.[1]) {
      return {
        heard: heardMatch?.[1]?.replace(/\\"/g, '"') ?? '',
        reply: replyMatch[1].replace(/\\"/g, '"'),
      };
    }
  }
  return null;
}
