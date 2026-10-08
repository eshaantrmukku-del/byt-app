import {
  createAudioPlayer,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type AudioPlayer,
} from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';
import { X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { coachClient, newRequestId } from '@/services/coach/coachClient';
import { toCoachError } from '@/services/coach/errors';
import { acceptGoalProposal, applyTurnCredits } from '@/services/coach/turns';
import { VOICE_MAX_DURATION_MS, type GoalProgressProposal, type VoiceAudioMimeType, type VoiceTurnRequest } from '@/services/coach/types';
import { createConversation } from '@/services/conversationsService';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { useCreditsStore } from '@/stores/creditsStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useUserDataStore } from '@/stores/userDataStore';
import { theme } from '@/ui';

type CallState = 'idle' | 'listening' | 'processing' | 'speaking';

const STATUS: Record<CallState, string> = {
  idle: 'Tap to speak',
  listening: "Tap when you're done",
  processing: 'Thinking…',
  speaking: 'Tap to interrupt',
};

const BAR_COUNT = 5;
const MIN_TURN_MS = 600;
const USE_NATIVE = Platform.OS !== 'web';
const MIME_TYPE: VoiceAudioMimeType = Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4';
const PLAYBACK_START_TIMEOUT_MS = 4000;

const now = () => Date.now();
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export default function VoiceCallScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const uid = useAuthStore((s) => s.user?.uid);
  const activeId = useChatStore((s) => s.activeConversationId);
  const conversations = useUserDataStore((s) => s.conversations.items);
  const goals = useUserDataStore((s) => s.goals.items);
  const voiceEnabled = usePreferencesStore((s) => s.voiceInteraction);

  const [conversationId] = useState(() => params.id ?? activeId ?? (uid ? createConversation(uid) : null));
  const conversation = conversations.find((c) => c.id === conversationId);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [callState, setCallState] = useState<CallState>('idle');
  const [coachReply, setCoachReply] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [retryRequest, setRetryRequest] = useState<VoiceTurnRequest | null>(null);
  const [proposal, setProposal] = useState<GoalProgressProposal | null>(null);

  const player = useRef<AudioPlayer | null>(null);
  const playbackFile = useRef<File | null>(null);
  const startedAt = useRef(0);
  const autoStop = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callActive = useRef(true);

  const [pulse] = useState(() => new Animated.Value(1));
  const [bars] = useState(() => Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.35)));

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2800);
  }, []);

  useEffect(() => {
    if (callState !== 'listening' && callState !== 'speaking') {
      pulse.setValue(1);
      bars.forEach((b) => b.setValue(0.35));
      return;
    }
    const ease = Easing.inOut(Easing.ease);
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 1100, easing: ease, useNativeDriver: USE_NATIVE }),
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: ease, useNativeDriver: USE_NATIVE }),
      ])
    );
    const barLoop = Animated.parallel(
      bars.map((anim, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.timing(anim, { toValue: 0.35 + ((i % 3) + 1) * 0.2, duration: 280 + i * 40, easing: ease, useNativeDriver: USE_NATIVE }),
            Animated.timing(anim, { toValue: 0.25, duration: 280 + i * 40, easing: ease, useNativeDriver: USE_NATIVE }),
          ])
        )
      )
    );
    pulseLoop.start();
    barLoop.start();
    return () => {
      pulseLoop.stop();
      barLoop.stop();
    };
  }, [callState, pulse, bars]);

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
      if (recorder.isRecording) void recorder.stop().catch(() => undefined);
      releasePlayback();
    };
    // Mount/unmount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playReply = async (audio: { base64: string }) => {
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
    const file = new File(Paths.cache, `byt-reply-${Date.now()}.mp3`);
    file.write(audio.base64, { encoding: 'base64' });
    playbackFile.current = file;
    const p = createAudioPlayer(file.uri);
    player.current = p;
    setCallState('speaking');
    p.play();
    // Finished when it stops playing at the end, is interrupted, or never starts.
    const started = now();
    let hasPlayed = false;
    while (player.current === p && callActive.current) {
      await sleep(200);
      if (p.playing) hasPlayed = true;
      const atEnd = p.duration > 0 && p.currentTime >= p.duration - 0.25;
      if (hasPlayed && !p.playing && atEnd) break;
      if (!hasPlayed && now() - started > PLAYBACK_START_TIMEOUT_MS) throw new Error('playback did not start');
    }
    if (player.current === p) releasePlayback();
    if (callActive.current) setCallState('idle');
  };

  const sendTurn = async (request: VoiceTurnRequest) => {
    setRetryRequest(null);
    setCallState('processing');
    setCoachReply('');
    try {
      const response = await coachClient.voiceTurn(request);
      if (!callActive.current) return;
      applyTurnCredits(response.creditsRemaining);
      setCoachReply(response.reply);
      if (response.proposal) setProposal(response.proposal);
      if (response.audioBase64) {
        try {
          await playReply({ base64: response.audioBase64 });
        } catch {
          showToast("Couldn't play the coach's voice — the reply is shown above.");
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
        Alert.alert("You've run out of credits", 'Each voice message uses 1 credit. Manage your plan in Settings.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Settings', onPress: () => router.push('/settings') },
        ]);
        return;
      }
      if (coachError.retryable) setRetryRequest(request);
      setCoachReply(coachError.message);
    }
  };

  const startRecording = async () => {
    if (callState !== 'idle' || !conversationId) return;
    const account = useCreditsStore.getState().account;
    if (account && account.creditsRemaining <= 0) {
      Alert.alert("You've run out of credits", 'Each voice message uses 1 credit. Manage your plan in Settings.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Settings', onPress: () => router.push('/settings') },
      ]);
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
      await sendTurn({
        clientTurnId: newRequestId(),
        conversationId: conversation.id,
        mode: conversation.mode,
        ...(conversation.reflectionCheckInId ? { reflectionCheckInId: conversation.reflectionCheckInId } : {}),
        audioBase64: base64,
        mimeType: MIME_TYPE,
        wantAudio: true,
      });
    } catch {
      setCallState('idle');
      showToast('Couldn’t process that recording. Try again.');
    }
  };

  const interrupt = () => {
    releasePlayback();
    setCallState('idle');
  };

  const onOrbPress = () => {
    if (callState === 'idle') void startRecording();
    else if (callState === 'listening') void stopRecording();
    else if (callState === 'speaking') interrupt();
  };

  const endCall = () => router.back();

  const active = callState === 'listening' || callState === 'speaking';
  const orbTint =
    callState === 'listening' ? 'rgba(34,197,94,0.22)' : callState === 'speaking' ? theme.primarySoft : theme.surface;

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topBar}>
          <Pressable onPress={endCall} style={styles.closeBtn} hitSlop={12} accessibilityRole="button" accessibilityLabel="End session">
            <X size={22} color={theme.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.header}>
          <Text style={styles.title}>Voice</Text>
          <Text style={styles.status}>{STATUS[callState]}</Text>
        </View>

        <View style={styles.center}>
          <Pressable
            onPress={onOrbPress}
            disabled={callState === 'processing'}
            style={({ pressed }) => [styles.orbPressable, pressed && styles.orbPressed]}
            accessibilityRole="button"
            accessibilityLabel={STATUS[callState]}
          >
            <Animated.View
              style={[
                styles.glow,
                {
                  transform: [{ scale: pulse }],
                  opacity: active ? 0.9 : 0.35,
                  backgroundColor:
                    callState === 'listening'
                      ? 'rgba(34,197,94,0.18)'
                      : callState === 'speaking'
                        ? 'rgba(59,130,246,0.2)'
                        : 'rgba(148,163,184,0.08)',
                },
              ]}
            />
            <View style={[styles.orb, { backgroundColor: orbTint, borderColor: active ? theme.primary : theme.border }]}>
              <View style={styles.waveRow}>
                {bars.map((anim, i) => (
                  <Animated.View
                    key={i}
                    style={[
                      styles.waveBar,
                      {
                        transform: [{ scaleY: anim }],
                        backgroundColor:
                          callState === 'listening' ? theme.success : callState === 'speaking' ? theme.primary : theme.textMuted,
                        opacity: callState === 'processing' ? 0.35 : active ? 1 : 0.45,
                      },
                    ]}
                  />
                ))}
              </View>
            </View>
          </Pressable>
        </View>

        {toast ? (
          <View style={styles.toast}>
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        ) : null}

        <ScrollView style={styles.replyScroll} contentContainerStyle={styles.replyScrollContent} showsVerticalScrollIndicator={false}>
          {coachReply ? (
            <Text style={styles.replyText}>{coachReply}</Text>
          ) : (
            <Text style={styles.replyHint}>Your coach will respond here. Speak naturally — short turns work best.</Text>
          )}
          {proposal && callState === 'idle' ? (
            <View style={styles.proposalCard}>
              <Text style={styles.proposalTitle}>
                Set {goals.find((g) => g.id === proposal.goalId)?.title ?? 'this goal'} to {proposal.progress}%?
              </Text>
              {proposal.reason ? <Text style={styles.replyHint}>{proposal.reason}</Text> : null}
              <View style={styles.proposalActions}>
                <Pressable onPress={() => setProposal(null)} accessibilityRole="button" accessibilityLabel="Dismiss goal suggestion">
                  <Text style={styles.endLinkText}>Not now</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (!uid) return;
                    const next = proposal;
                    setProposal(null);
                    void acceptGoalProposal(uid, next);
                  }}
                  style={styles.retryButton}
                  accessibilityRole="button"
                  accessibilityLabel="Update goal progress"
                >
                  <Text style={styles.retryText}>Update</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          {retryRequest && callState === 'idle' ? (
            <Pressable
              onPress={() => void sendTurn(retryRequest)}
              style={styles.retryButton}
              accessibilityRole="button"
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        <Pressable onPress={endCall} style={styles.endLink} accessibilityRole="button">
          <Text style={styles.endLinkText}>End session</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  safeArea: { flex: 1 },
  topBar: { paddingHorizontal: 20, paddingTop: 4, alignItems: 'flex-start' },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: { alignItems: 'center', paddingTop: 8, paddingHorizontal: 32 },
  title: { color: theme.text, fontSize: 20, fontWeight: '600', marginBottom: 8 },
  status: { color: theme.textSecondary, fontSize: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 260 },
  orbPressable: { alignItems: 'center', justifyContent: 'center' },
  orbPressed: { opacity: 0.92 },
  glow: { position: 'absolute', width: 280, height: 280, borderRadius: 140 },
  orb: { width: 200, height: 200, borderRadius: 100, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  waveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 56 },
  waveBar: { width: 5, height: 44, borderRadius: 3 },
  toast: {
    alignSelf: 'center',
    marginBottom: 8,
    marginHorizontal: 24,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.28)',
  },
  toastText: { color: theme.success, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  replyScroll: { maxHeight: 220, marginHorizontal: 28 },
  replyScrollContent: { flexGrow: 1, justifyContent: 'flex-end', paddingBottom: 8, alignItems: 'center' },
  replyText: { color: theme.text, fontSize: 17, lineHeight: 26, textAlign: 'center' },
  replyHint: { color: theme.textMuted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  retryButton: { marginTop: 12, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 12, backgroundColor: theme.primarySoft },
  retryText: { color: theme.primary, fontWeight: '700' },
  endLink: { alignItems: 'center', paddingVertical: 20, paddingBottom: 28 },
  endLinkText: { color: theme.textSecondary, fontSize: 15, fontWeight: '500' },
  proposalCard: { marginTop: 16, alignItems: 'center', gap: 6 },
  proposalTitle: { color: theme.text, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  proposalActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
