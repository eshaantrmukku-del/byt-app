import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, Pause, Play } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { coachClient } from '@/services/coach/coachClient';
import type { CoachVoice, ReplyAudio } from '@/services/coach/types';
import { theme } from '@/ui';

import { VOICE_OPTIONS } from './voices';

/** Samples are the same for everyone, so each is fetched once per app run. */
const samples = new Map<CoachVoice, ReplyAudio>();

type Props = {
  value: CoachVoice;
  onChange: (voice: CoachVoice) => void;
  /** Play the sample when a voice is chosen, so you hear what you picked. */
  previewOnSelect?: boolean;
};

export function VoicePicker({ value, onChange, previewOnSelect = true }: Props) {
  const [loading, setLoading] = useState<CoachVoice | null>(null);
  const [playing, setPlaying] = useState<CoachVoice | null>(null);
  const [failed, setFailed] = useState<CoachVoice | null>(null);
  const player = useRef<AudioPlayer | null>(null);
  const file = useRef<File | null>(null);
  /** Bumped whenever a new sample is asked for, so a slow fetch can't play over a newer one. */
  const request = useRef(0);

  const stop = useCallback(() => {
    player.current?.pause();
    player.current?.remove();
    player.current = null;
    try {
      file.current?.delete();
    } catch {
      // Already gone.
    }
    file.current = null;
    setPlaying(null);
  }, []);

  useEffect(
    () => () => {
      request.current += 1;
      stop();
    },
    [stop]
  );

  const play = async (voice: CoachVoice) => {
    const turn = ++request.current;
    stop();
    setFailed(null);
    try {
      let audio = samples.get(voice) ?? null;
      if (!audio) {
        setLoading(voice);
        audio = await coachClient.voicePreview(voice);
        if (audio) samples.set(voice, audio);
      }
      if (turn !== request.current) return;
      setLoading(null);
      if (!audio) {
        setFailed(voice);
        return;
      }
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
      // Phones play from a cache file; the web has no file system, so it plays from memory.
      let uri = `data:audio/wav;base64,${audio.base64}`;
      if (Platform.OS !== 'web') {
        const clip = new File(Paths.cache, `byt-voice-${voice}-${turn}.wav`);
        await clip.write(audio.base64, { encoding: 'base64' });
        file.current = clip;
        uri = clip.uri;
      }
      if (turn !== request.current) return;
      const p = createAudioPlayer(uri);
      player.current = p;
      p.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish && player.current === p) stop();
      });
      p.play();
      setPlaying(voice);
    } catch {
      if (turn === request.current) {
        setLoading(null);
        setFailed(voice);
      }
    }
  };

  const toggle = (voice: CoachVoice) => {
    if (playing === voice || loading === voice) {
      request.current += 1;
      setLoading(null);
      stop();
    } else {
      void play(voice);
    }
  };

  return (
    <View style={styles.list} accessibilityRole="radiogroup" accessibilityLabel="Coach voice">
      {VOICE_OPTIONS.map((option) => {
        const selected = option.id === value;
        const busy = loading === option.id;
        const isPlaying = playing === option.id;
        return (
          <Pressable
            key={option.id}
            onPress={() => {
              onChange(option.id);
              if (previewOnSelect && !selected) void play(option.id);
            }}
            style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.rowPressed]}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${option.name}, ${option.tone}`}
          >
            <LinearGradient colors={option.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.swatch}>
              <LinearGradient colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0)']} style={styles.swatchShine} />
            </LinearGradient>
            <View style={styles.text}>
              <Text style={styles.name}>{option.name}</Text>
              <Text style={[styles.tone, failed === option.id && styles.toneError]}>
                {failed === option.id ? 'Couldn’t play it. Try again.' : option.tone}
              </Text>
            </View>
            <Pressable
              onPress={() => toggle(option.id)}
              hitSlop={8}
              style={[styles.play, isPlaying && { backgroundColor: option.colors[0] }]}
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? `Stop ${option.name}` : `Hear ${option.name}`}
            >
              {busy ? (
                <ActivityIndicator size="small" color={theme.text} />
              ) : isPlaying ? (
                <Pause size={15} color="#FFF" fill="#FFF" />
              ) : (
                <Play size={15} color={theme.text} fill={theme.text} style={styles.playIcon} />
              )}
            </Pressable>
            <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <Check size={13} color="#FFF" strokeWidth={3} /> : null}</View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
  },
  rowSelected: { borderColor: theme.primary, backgroundColor: 'rgba(59,130,246,0.08)' },
  rowPressed: { opacity: 0.85 },
  swatch: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden' },
  swatchShine: { position: 'absolute', top: 1, left: 6, width: 28, height: 20, borderRadius: 14 },
  text: { flex: 1 },
  name: { color: theme.text, fontSize: 16, fontWeight: '700' },
  tone: { color: theme.textSecondary, fontSize: 13, marginTop: 2 },
  toneError: { color: '#F87171' },
  play: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surfaceElevated,
  },
  playIcon: { marginLeft: 2 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { backgroundColor: theme.primary, borderColor: theme.primary },
});
