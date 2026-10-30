import type { CoachVoice } from '@/services/coach/types';

export type VoiceOption = {
  id: CoachVoice;
  name: string;
  /** How it sounds, in a few words. */
  tone: string;
  /** The orb's colours while this voice is talking: [from, to]. */
  colors: readonly [string, string];
};

/** Kept in the same order as COACH_VOICES; the server maps each id to a provider voice. */
export const VOICE_OPTIONS: readonly VoiceOption[] = [
  { id: 'ivy', name: 'Ivy', tone: 'Warm and unhurried', colors: ['#FB923C', '#F472B6'] },
  { id: 'nova', name: 'Nova', tone: 'Soft and reassuring', colors: ['#A78BFA', '#60A5FA'] },
  { id: 'wren', name: 'Wren', tone: 'Gentle and bright', colors: ['#2DD4BF', '#22D3EE'] },
  { id: 'leo', name: 'Leo', tone: 'Friendly and grounded', colors: ['#3B82F6', '#22D3EE'] },
  { id: 'kai', name: 'Kai', tone: 'Smooth and thoughtful', colors: ['#6366F1', '#A855F7'] },
  { id: 'sam', name: 'Sam', tone: 'Calm and steady', colors: ['#38BDF8', '#818CF8'] },
];

export function voiceOption(id: CoachVoice): VoiceOption {
  return VOICE_OPTIONS.find((v) => v.id === id) ?? VOICE_OPTIONS[0]!;
}
