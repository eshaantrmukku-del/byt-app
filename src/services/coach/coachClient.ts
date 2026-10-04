import type { ConversationMode } from '@/types/models';

/**
 * Contract for the BYT backend coaching engine (Cloud Functions, built in a later step).
 * The app never calls Gemini or Deepgram directly; credits are charged server-side,
 * once per `clientTurnId`.
 */
export type CoachTurnRequest = {
  conversationId: string;
  clientTurnId: string;
  text: string;
  mode: ConversationMode;
};

export type CoachTurnResult =
  | { ok: true; reply: string; creditsRemaining: number }
  | { ok: false; reason: 'no-credits' | 'rate-limited' | 'unavailable' | 'not-configured'; message: string };

export type CoachClient = {
  sendTurn: (request: CoachTurnRequest) => Promise<CoachTurnResult>;
};

export const coachClient: CoachClient = {
  sendTurn: async () => ({
    ok: false,
    reason: 'not-configured',
    message: 'Your coach is coming soon.',
  }),
};
