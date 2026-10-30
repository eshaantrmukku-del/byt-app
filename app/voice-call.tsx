import {
  createAudioPlayer,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type AudioPlayer,
  type RecordingOptions,
} from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { AudioLines, ChevronDown, Mic, PhoneOff, Square, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { coachClient, newRequestId } from '@/services/coach/coachClient';
import { toCoachError } from '@/services/coach/errors';
import { acceptGoalProposal, applyTurnUsage, markAllowanceUsed } from '@/services/coach/turns';
import {
  VOICE_MAX_DURATION_MS,
  type CoachVoice,
  type GoalProgressProposal,
  type ReplyAudio,
  type VoiceAudioMimeType,
  type VoiceTurnRequest,
  type VoiceTurnResponse,
} from '@/services/coach/types';
import { createConversation } from '@/services/conversationsService';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { currentAccount, isUsedUp, resetLabel } from '@/features/usage/usage';
import { VoicePicker } from '@/features/voice/VoicePicker';
import { voiceOption } from '@/features/voice/voices';
import { useUsageStore } from '@/stores/usageStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useUserDataStore } from '@/stores/userDataStore';
import { theme } from '@/ui';

type CallState = 'idle' | 'listening' | 'processing' | 'speaking';

const ORB = 200;
const RING_COUNT = 3;
/** Bar heights relative to the loudest, so the middle bar leads like a voice meter. */
const BAR_WEIGHTS = [0.55, 0.8, 1, 0.8, 0.55];
const MIN_TURN_MS = 600;
const USE_NATIVE = Platform.OS !== 'web';
const MIME_TYPE: VoiceAudioMimeType = Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4';
const PLAYBACK_START_TIMEOUT_MS = 4000;
/** Metering lets the orb follow the user's voice while they talk. */
const RECORDING: RecordingOptions = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

const now = () => Date.now();
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
/** Recorder metering is in dBFS (about -60 for a quiet room, 0 at clipping); map speech to 0–1. */
const loudness = (db: number | undefined) => (db === undefined ? 0 : Math.max(0, Math.min(1, (db + 50) / 42)));

export default function VoiceCallScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const uid = useAuthStore((s) => s.user?.uid);
  const activeId = useChatStore((s) => s.activeConversationId);
  const conversations = useUserDataStore((s) => s.conversations.items);
  const goals = useUserDataStore((s) => s.goals.items);
  const voiceEnabled = usePreferencesStore((s) => s.voiceInteraction);
  const coachVoice = usePreferencesStore((s) => s.coachVoice);
  const setCoachVoice = usePreferencesStore((s) => s.setCoachVoice);
  const voice = voiceOption(coachVoice);

  const [conversationId] = useState(() => params.id ?? activeId ?? (uid ? createConversation(uid) : null));
  const conversation = conversations.find((c) => c.id === conversationId);

  const recorder = useAudioRecorder(RECORDING);
  const recorderState = useAudioRecorderState(recorder, 80);
  const [callState, setCallState] = useState<CallState>('idle');
  const [heard, setHeard] = useState('');
  const [coachReply, setCoachReply] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [retryRequest, setRetryRequest] = useState<VoiceTurnRequest | null>(null);
  const [proposal, setProposal] = useState<GoalProgressProposal | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const player = useRef<AudioPlayer | null>(null);
  const playbackFile = useRef<File | null>(null);
  const startedAt = useRef(0);
  const autoStop = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callActive = useRef(true);
  /** Bumped on interrupt; a reply that is still playing parts stops when it changes. */
  const playback = useRef(0);

  const [breath] = useState(() => new Animated.Value(1));
  const [level] = useState(() => new Animated.Value(0));
  const [spin] = useState(() => new Animated.Value(0));
  const [rings] = useState(() => Array.from({ length: RING_COUNT }, () => new Animated.Value(0)));
  const [bars] = useState(() => BAR_WEIGHTS.map(() => new Animated.Value(0.3)));
  const [dots] = useState(() => [0, 1, 2].map(() => new Animated.Value(0.3)));
  const [presence] = useState(() => new Animated.Value(0));

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2800);
  }, []);

  // The orb's motion for each state: breathing at rest, ripples while someone talks,
  // a slow turn while the coach thinks.
  useEffect(() => {
    const ease = Easing.inOut(Easing.ease);
    const loops: Animated.CompositeAnimation[] = [];
    const talking = callState === 'listening' || callState === 'speaking';
    Animated.timing(presence, { toValue: callState === 'idle' ? 0 : 1, duration: 450, easing: ease, useNativeDriver: USE_NATIVE }).start();
    loops.push(
      Animated.loop(
        Animated.sequence([
          Animated.timing(breath, { toValue: talking ? 1.04 : 1.025, duration: talking ? 900 : 2200, easing: ease, useNativeDriver: USE_NATIVE }),
          Animated.timing(breath, { toValue: 1, duration: talking ? 900 : 2200, easing: ease, useNativeDriver: USE_NATIVE }),
        ])
      )
    );
    if (talking) {
      rings.forEach((ring, i) => {
        ring.setValue(0);
        loops.push(
          Animated.loop(
            Animated.sequence([
              Animated.delay(i * 700),
              Animated.timing(ring, { toValue: 1, duration: 2100, easing: Easing.out(Easing.quad), useNativeDriver: USE_NATIVE }),
            ])
          )
        );
      });
    } else {
      rings.forEach((ring) => ring.setValue(0));
    }
    if (callState === 'speaking') {
      bars.forEach((bar, i) =>
        loops.push(
          Animated.loop(
            Animated.sequence([
              Animated.timing(bar, { toValue: 0.45 + BAR_WEIGHTS[i]! * 0.55, duration: 260 + i * 55, easing: ease, useNativeDriver: USE_NATIVE }),
              Animated.timing(bar, { toValue: 0.25 + (i % 2) * 0.1, duration: 300 + i * 45, easing: ease, useNativeDriver: USE_NATIVE }),
            ])
          )
        )
      );
    }
    if (callState === 'processing') {
      spin.setValue(0);
      loops.push(Animated.loop(Animated.timing(spin, { toValue: 1, duration: 2600, easing: Easing.linear, useNativeDriver: USE_NATIVE })));
      dots.forEach((dot, i) =>
        loops.push(
          Animated.loop(
            Animated.sequence([
              Animated.delay(i * 180),
              Animated.timing(dot, { toValue: 1, duration: 380, easing: ease, useNativeDriver: USE_NATIVE }),
              Animated.timing(dot, { toValue: 0.3, duration: 380, easing: ease, useNativeDriver: USE_NATIVE }),
              Animated.delay((2 - i) * 180),
            ])
          )
        )
      );
    }
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [callState, breath, rings, bars, spin, dots, presence]);

  // While they talk, the orb swells with their voice.
  const listening = callState === 'listening';
  const metering = recorderState.metering;
  useEffect(() => {
    Animated.timing(level, { toValue: listening ? loudness(metering) : 0, duration: 90, useNativeDriver: USE_NATIVE }).start();
  }, [listening, metering, level]);

  const releasePlayback = useCallback(() => {
    player.current?.pause();
    player.current?.remove();
    player.current = null;
    try {
      playbackFile.current?.delete();
    } catch {
      // Already gone.
    }
    playbackFile.current = null;
  }, []);

  useEffect(() => {
    callActive.current = true;
    if (!voiceEnabled) {
      Alert.alert('Voice is turned off', 'Turn on Voice Interaction in Settings to talk with your coach.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } else {
      void (async () => {
        const permission = await requestRecordingPermissionsAsync().catch(() => null);
        if (!permission?.granted) {
          Alert.alert('Microphone access needed', 'Allow microphone access to use voice coaching.');
          return;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }).catch(() => undefined);
      })();
    }
    return () => {
      callActive.current = false;
      if (autoStop.current) clearTimeout(autoStop.current);
      // useAudioRecorder releases the native recorder in its own cleanup, which runs
      // before this one; touching a released recorder throws. Release stops it anyway.
      try {
        if (recorder.isRecording) void recorder.stop().catch(() => undefined);
      } catch {
        // Already released.
      }
      releasePlayback();
    };
    // Mount/unmount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Plays one clip to the end. Resolves early if the user interrupts or leaves. */
  const playClip = async (audio: ReplyAudio) => {
    const file = new File(Paths.cache, `byt-reply-${Date.now()}.wav`);
    await file.write(audio.base64, { encoding: 'base64' });
    playbackFile.current = file;
    const p = createAudioPlayer(file.uri);
    player.current = p;
    p.play();
    // Finished when it stops playing at the end, is interrupted, or never starts.
    const started = now();
    let hasPlayed = false;
    while (player.current === p && callActive.current) {
      await sleep(100);
      if (p.playing) hasPlayed = true;
      const atEnd = p.duration > 0 && p.currentTime >= p.duration - 0.15;
      if (hasPlayed && !p.playing && atEnd) break;
      if (!hasPlayed && now() - started > PLAYBACK_START_TIMEOUT_MS) throw new Error('playback did not start');
    }
    if (player.current === p) releasePlayback();
  };

  /**
   * The first part arrives with the reply, so the coach starts talking at once. The
   * other parts are requested straight away, in parallel, and play in order.
   */
  const playReply = async (response: VoiceTurnResponse, spokenWith: CoachVoice) => {
    if (!response.replyAudio) return;
    const turn = ++playback.current;
    const later = Array.from({ length: Math.max(0, response.audioParts - 1) }, (_, i) =>
      coachClient.voiceAudio(response.requestId, i + 1, spokenWith).catch(() => null)
    );
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
    setCallState('speaking');
    try {
      await playClip(response.replyAudio);
      for (const next of later) {
        if (playback.current !== turn || !callActive.current) return;
        const audio = await next;
        if (playback.current !== turn || !callActive.current) return;
        if (!audio) {
          showToast('Part of the reply couldn’t be spoken — it’s shown below.');
          return;
        }
        await playClip(audio);
      }
    } finally {
      if (playback.current === turn && callActive.current) setCallState('idle');
    }
  };

  const showAllowanceUsed = () => {
    const account = currentAccount(useUsageStore.getState().account);
    Alert.alert("You've used today's coaching allowance", `It resets ${resetLabel(account.resetsAt)}. Your conversation is saved.`, [
      { text: 'OK', style: 'cancel' },
      { text: 'Settings', onPress: () => router.push('/settings') },
    ]);
  };

  const sendTurn = async (request: VoiceTurnRequest) => {
    setRetryRequest(null);
    setCallState('processing');
    setCoachReply('');
    try {
      const response = await coachClient.voiceTurn(request);
      if (!callActive.current) return;
      applyTurnUsage(response.usage);
      setHeard(response.transcript);
      setCoachReply(response.reply.text);
      if (response.proposal) setProposal(response.proposal);
      if (response.replyAudio) {
        try {
          await playReply(response, request.voice ?? coachVoice);
        } catch {
          showToast("Couldn't play the coach's voice — the reply is shown below.");
          setCallState('idle');
        }
      } else {
        setCallState('idle');
      }
    } catch (error) {
      if (!callActive.current) return;
      const coachError = toCoachError(error);
      setCallState('idle');
      if (coachError.reason === 'no-credits') {
        markAllowanceUsed();
        showAllowanceUsed();
        return;
      }
      if (coachError.retryable) setRetryRequest(request);
      setCoachReply(coachError.message);
    }
  };

  const startRecording = async () => {
    if (callState !== 'idle' || !conversationId) return;
    if (isUsedUp(currentAccount(useUsageStore.getState().account))) {
      showAllowanceUsed();
      return;
    }
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone access needed', 'Allow microphone access to use voice coaching.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedAt.current = now();
      setRetryRequest(null);
      setCallState('listening');
      autoStop.current = setTimeout(() => void stopRecording(), VOICE_MAX_DURATION_MS - 500);
    } catch {
      setCallState('idle');
      showToast('Couldn’t start the microphone. Try again.');
    }
  };

  const stopRecording = async () => {
    if (autoStop.current) clearTimeout(autoStop.current);
    autoStop.current = null;
    const durationMs = now() - startedAt.current;
    setCallState('processing');
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri || durationMs < MIN_TURN_MS) {
        setCallState('idle');
        showToast('That was a bit short — tap and speak, then tap again.');
        return;
      }
      const file = new File(uri);
      const base64 = await file.base64();
      try {
        file.delete();
      } catch {
        // Temporary recording; the OS cleans it up anyway.
      }
      if (!conversation) {
        setCallState('idle');
        showToast('Still loading your conversation. Try again in a moment.');
        return;
      }
      setHeard('');
      await sendTurn({
        requestId: newRequestId(),
        conversationId: conversation.id,
        mode: conversation.mode,
        ...(conversation.reflectionCheckInId ? { reflectionCheckInId: conversation.reflectionCheckInId } : {}),
        audio: { base64, mimeType: MIME_TYPE, durationMs: Math.min(durationMs, VOICE_MAX_DURATION_MS) },
        wantAudio: true,
        voice: coachVoice,
      });
    } catch {
      setCallState('idle');
      showToast('Couldn’t process that recording. Try again.');
    }
  };

  const interrupt = () => {
    playback.current += 1;
    releasePlayback();
    setCallState('idle');
  };

  const onOrbPress = () => {
    if (callState === 'idle') void startRecording();
    else if (callState === 'listening') void stopRecording();
    else if (callState === 'speaking') interrupt();
  };

  const openPicker = () => {
    // A sample would talk over the coach.
    if (callState === 'speaking') interrupt();
    setPickerOpen(true);
  };

  const endCall = () => router.back();

  const title =
    callState === 'listening'
      ? 'Listening'
      : callState === 'processing'
        ? 'Thinking'
        : callState === 'speaking'
          ? `${voice.name} is speaking`
          : 'Tap to talk';
  const subtitle =
    callState === 'listening'
      ? `${clock(recorderState.durationMillis ?? 0)} · tap when you’re done`
      : callState === 'processing'
        ? 'Taking in what you said'
        : callState === 'speaking'
          ? 'Tap to interrupt'
          : 'Speak naturally. Short turns work best.';

  const orbScale = Animated.multiply(breath, Animated.add(1, Animated.multiply(level, 0.16)));
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const glowOpacity = Animated.add(0.35, Animated.add(Animated.multiply(presence, 0.3), Animated.multiply(level, 0.35)));
  const busy = callState === 'processing';

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#05080F', '#0B1120', '#0F1A33']} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      <Animated.View pointerEvents="none" style={[styles.ambient, { opacity: glowOpacity }]}>
        <LinearGradient colors={[`${voice.colors[0]}38`, `${voice.colors[1]}00`]} style={styles.ambientFill} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} />
      </Animated.View>

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.topBar}>
          <Pressable onPress={endCall} style={styles.glassButton} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <X size={20} color={theme.text} />
          </Pressable>
          <Pressable
            onPress={openPicker}
            disabled={callState === 'listening' || busy}
            style={({ pressed }) => [styles.voiceChip, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Voice: ${voice.name}. Change voice`}
          >
            <LinearGradient colors={voice.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.chipDot} />
            <Text style={styles.chipText}>{voice.name}</Text>
            <ChevronDown size={16} color={theme.textSecondary} />
          </Pressable>
          <View style={styles.topSpacer} />
        </View>

        <View style={styles.stage}>
          <Pressable
            onPress={onOrbPress}
            disabled={busy}
            style={styles.orbHit}
            accessibilityRole="button"
            accessibilityLabel={`${title}. ${subtitle}`}
          >
            {rings.map((ring, i) => (
              <Animated.View
                key={i}
                pointerEvents="none"
                style={[
                  styles.ring,
                  {
                    borderColor: voice.colors[i % 2],
                    opacity: ring.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.5, 0] }),
                    transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
                  },
                ]}
              />
            ))}
            <Animated.View style={[styles.orbShadow, { shadowColor: voice.colors[1], transform: [{ scale: orbScale }] }]}>
              <Animated.View style={[styles.orb, { transform: [{ rotate }] }]}>
                <LinearGradient colors={voice.colors} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
                <Animated.View style={[styles.orbDim, { opacity: presence.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0] }) }]} />
              </Animated.View>
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(255,255,255,0.26)', 'rgba(255,255,255,0)']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 0.85 }}
                style={styles.orbShine}
              />
              <View pointerEvents="none" style={styles.orbContent}>
                {callState === 'idle' ? (
                  <Mic size={44} color="#FFFFFF" strokeWidth={1.8} />
                ) : callState === 'processing' ? (
                  <View style={styles.dotRow}>
                    {dots.map((dot, i) => (
                      <Animated.View key={i} style={[styles.dot, { opacity: dot, transform: [{ scale: Animated.add(0.7, Animated.multiply(dot, 0.4)) }] }]} />
                    ))}
                  </View>
                ) : (
                  <View style={styles.barRow}>
                    {bars.map((bar, i) => (
                      <Animated.View
                        key={i}
                        style={[
                          styles.bar,
                          {
                            transform: [
                              { scaleY: listening ? Animated.add(0.18, Animated.multiply(level, BAR_WEIGHTS[i]! * 0.82)) : bar },
                            ],
                          },
                        ]}
                      />
                    ))}
                  </View>
                )}
              </View>
            </Animated.View>
          </Pressable>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>

        <View style={styles.captionArea}>
          {toast ? (
            <View style={styles.toast}>
              <Text style={styles.toastText}>{toast}</Text>
            </View>
          ) : null}
          <ScrollView style={styles.captions} contentContainerStyle={styles.captionsContent} showsVerticalScrollIndicator={false}>
            {heard ? (
              <View style={styles.captionBlock}>
                <Text style={styles.captionLabel}>YOU</Text>
                <Text style={styles.heardText}>{heard}</Text>
              </View>
            ) : null}
            {coachReply ? (
              <View style={styles.captionBlock}>
                <Text style={[styles.captionLabel, { color: voice.colors[0] }]}>{voice.name.toUpperCase()}</Text>
                <Text style={styles.replyText}>{coachReply}</Text>
              </View>
            ) : !heard ? (
              <Text style={styles.hint}>What you say and your coach’s reply will appear here.</Text>
            ) : null}
            {proposal && callState === 'idle' ? (
              <View style={styles.proposalCard}>
                <Text style={styles.proposalTitle}>
                  Set {goals.find((g) => g.id === proposal.goalId)?.title ?? 'this goal'} to {proposal.progress}%?
                </Text>
                {proposal.reason ? <Text style={styles.hint}>{proposal.reason}</Text> : null}
                <View style={styles.proposalActions}>
                  <Pressable onPress={() => setProposal(null)} style={styles.ghostPill} accessibilityRole="button" accessibilityLabel="Dismiss goal suggestion">
                    <Text style={styles.ghostPillText}>Not now</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (!uid) return;
                      const next = proposal;
                      setProposal(null);
                      void acceptGoalProposal(uid, next);
                    }}
                    style={styles.solidPill}
                    accessibilityRole="button"
                    accessibilityLabel="Update goal progress"
                  >
                    <Text style={styles.solidPillText}>Update</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
            {retryRequest && callState === 'idle' ? (
              <Pressable onPress={() => void sendTurn(retryRequest)} style={[styles.solidPill, styles.retry]} accessibilityRole="button">
                <Text style={styles.solidPillText}>Try again</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </View>

        <View style={styles.controls}>
          <View style={styles.controlSlot}>
            <Pressable
              onPress={openPicker}
              disabled={callState === 'listening' || busy}
              style={({ pressed }) => [styles.sideButton, (callState === 'listening' || busy) && styles.disabled, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Change voice"
            >
              <AudioLines size={22} color={theme.text} />
            </Pressable>
            <Text style={styles.controlLabel}>Voice</Text>
          </View>

          <View style={styles.controlSlot}>
            <Pressable
              onPress={onOrbPress}
              disabled={busy}
              style={({ pressed }) => [busy && styles.disabled, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={callState === 'listening' ? 'Done speaking' : callState === 'speaking' ? 'Interrupt' : 'Start speaking'}
            >
              <LinearGradient
                colors={callState === 'listening' ? ['#F8FAFC', '#CBD5E1'] : voice.colors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.mainButton, { shadowColor: voice.colors[1] }]}
              >
                {callState === 'listening' || callState === 'speaking' ? (
                  <Square size={22} color={callState === 'listening' ? '#0B1120' : '#FFFFFF'} fill={callState === 'listening' ? '#0B1120' : '#FFFFFF'} />
                ) : (
                  <Mic size={28} color="#FFFFFF" />
                )}
              </LinearGradient>
            </Pressable>
            <Text style={styles.controlLabel}>{callState === 'listening' ? 'Done' : callState === 'speaking' ? 'Stop' : 'Talk'}</Text>
          </View>

          <View style={styles.controlSlot}>
            <Pressable onPress={endCall} style={({ pressed }) => [styles.sideButton, styles.endButton, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="End session">
              <PhoneOff size={22} color="#FFFFFF" />
            </Pressable>
            <Text style={styles.controlLabel}>End</Text>
          </View>
        </View>
      </SafeAreaView>

      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)} statusBarTranslucent>
        <Pressable style={styles.sheetBackdrop} onPress={() => setPickerOpen(false)} accessibilityLabel="Close voice picker" />
        <View style={styles.sheet}>
          <SafeAreaView edges={['bottom']}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Choose a voice</Text>
            <Text style={styles.sheetSubtitle}>Tap one to hear it. Your coach will use it from the next reply.</Text>
            <ScrollView style={styles.sheetList} showsVerticalScrollIndicator={false}>
              <VoicePicker value={coachVoice} onChange={setCoachVoice} />
            </ScrollView>
            <Pressable onPress={() => setPickerOpen(false)} style={[styles.solidPill, styles.sheetDone]} accessibilityRole="button">
              <Text style={styles.solidPillText}>Done</Text>
            </Pressable>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

const glass = { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' } as const;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  safeArea: { flex: 1 },
  ambient: { position: 'absolute', top: 0, left: 0, right: 0, height: '70%' },
  ambientFill: { flex: 1 },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.4 },

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 6 },
  glassButton: { ...glass, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  topSpacer: { width: 40 },
  voiceChip: { ...glass, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 8, paddingRight: 12, height: 36, borderRadius: 18 },
  chipDot: { width: 20, height: 20, borderRadius: 10 },
  chipText: { color: theme.text, fontSize: 15, fontWeight: '600' },

  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 300 },
  orbHit: { width: ORB * 1.5, height: ORB * 1.5, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: ORB, height: ORB, borderRadius: ORB / 2, borderWidth: 1.5 },
  orbShadow: {
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 40,
    elevation: 16,
    backgroundColor: theme.background,
  },
  orb: { ...StyleSheet.absoluteFill, borderRadius: ORB / 2, overflow: 'hidden' },
  orbDim: { ...StyleSheet.absoluteFill, backgroundColor: '#0B1120' },
  orbShine: {
    position: 'absolute',
    top: -ORB * 0.06,
    left: ORB * 0.2,
    width: ORB * 0.6,
    height: ORB * 0.6,
    borderRadius: ORB * 0.3,
    transform: [{ scaleY: 0.6 }],
  },
  orbContent: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 72 },
  bar: { width: 7, height: 72, borderRadius: 4, backgroundColor: '#FFFFFF' },
  dotRow: { flexDirection: 'row', gap: 12 },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#FFFFFF' },
  title: { color: theme.text, fontSize: 24, fontWeight: '700', marginTop: 8, letterSpacing: -0.3 },
  subtitle: { color: theme.textSecondary, fontSize: 15, marginTop: 6, fontVariant: ['tabular-nums'] },

  captionArea: { paddingHorizontal: 24 },
  toast: {
    ...glass,
    alignSelf: 'center',
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
  },
  toastText: { color: theme.text, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  captions: { maxHeight: 200 },
  captionsContent: { flexGrow: 1, justifyContent: 'flex-end', gap: 14, paddingBottom: 4 },
  captionBlock: { gap: 4 },
  captionLabel: { color: theme.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  heardText: { color: theme.textSecondary, fontSize: 15, lineHeight: 22 },
  replyText: { color: theme.text, fontSize: 17, lineHeight: 26 },
  hint: { color: theme.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  proposalCard: { ...glass, borderRadius: 18, padding: 16, gap: 8, alignItems: 'center' },
  proposalTitle: { color: theme.text, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  proposalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  ghostPill: { ...glass, paddingVertical: 9, paddingHorizontal: 16, borderRadius: 999 },
  ghostPillText: { color: theme.text, fontWeight: '600' },
  solidPill: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 999, backgroundColor: theme.primary, alignItems: 'center' },
  solidPillText: { color: '#FFFFFF', fontWeight: '700' },
  retry: { alignSelf: 'center' },

  controls: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start', paddingTop: 20, paddingBottom: 12 },
  controlSlot: { alignItems: 'center', gap: 8, width: 90 },
  sideButton: { ...glass, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginVertical: 8 },
  endButton: { backgroundColor: '#E5484D', borderColor: 'rgba(255,255,255,0.12)' },
  mainButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
  controlLabel: { color: theme.textSecondary, fontSize: 12, fontWeight: '600' },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(2,6,15,0.6)' },
  sheet: {
    backgroundColor: '#101828',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 20,
    paddingBottom: 12,
    maxHeight: '80%',
  },
  sheetHandle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)', marginTop: 10, marginBottom: 16 },
  sheetTitle: { color: theme.text, fontSize: 20, fontWeight: '700' },
  sheetSubtitle: { color: theme.textSecondary, fontSize: 14, marginTop: 4, marginBottom: 16 },
  sheetList: { flexGrow: 0 },
  sheetDone: { marginTop: 16, paddingVertical: 14 },
});
