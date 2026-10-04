import { theme } from '@/constants/theme';
import { Message, useChats } from '@/context/ChatsContext';
import { buildCheckInsMemory, buildCoachProfileSummary, buildPastChatsMemory, getAiVoiceResponse } from '@/services/ai';
import { arrayBufferToBase64, isDeepgramConfigured, synthesizeCoachSpeech } from '@/services/deepgram';
import { Goal, useStore } from '@/store/useStore';
import { useFocusEffect } from '@react-navigation/native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type CallState = 'idle' | 'listening' | 'processing' | 'speaking';

const STATUS: Record<CallState, string> = {
  idle: 'Tap to speak',
  listening: "Tap when you're done",
  processing: 'Thinking…',
  speaking: 'Tap to interrupt',
};

const BAR_COUNT = 5;

export default function VoiceCallScreen() {
  const router = useRouter();
  const { goals, checkIns, updateGoal, addGoal, user, coachProfile, consumeCredit, refundCredit } = useStore();
  const { activeChat, addMessageToChat, chats } = useChats();
  const coachProfileSummary = buildCoachProfileSummary(coachProfile, user?.name || 'Client');
  const chatMode = activeChat?.mode ?? 'normal';
  const pastChatsMemory = useMemo(
    () =>
      buildPastChatsMemory(chats, activeChat?.id, 10, {
        excludeReflection: chatMode !== 'reflection',
      }),
    [chats, activeChat?.id, chatMode]
  );
  const checkInsMemory = useMemo(() => buildCheckInsMemory(checkIns), [checkIns]);

  const [callState, setCallState] = useState<CallState>('idle');
  const [coachReply, setCoachReply] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const recording = useRef<Audio.Recording | null>(null);
  const activeSound = useRef<Audio.Sound | null>(null);
  const ttsAbort = useRef<AbortController | null>(null);
  const playbackDone = useRef<(() => void) | null>(null);
  const callActive = useRef(true);
  const pulse = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);
  const barAnims = useRef(Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.35))).current;
  const barLoop = useRef<Animated.CompositeAnimation | null>(null);

  const styles = useMemo(() => createStyles(), []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2800);
  }, []);

  const stopPulse = useCallback(() => {
    pulseLoop.current?.stop();
    pulse.setValue(1);
  }, [pulse]);

  const startPulse = useCallback(() => {
    pulseLoop.current?.stop();
    pulse.setValue(1);
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.08,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    );
    pulseLoop.current.start();
  }, [pulse]);

  const stopBars = useCallback(() => {
    barLoop.current?.stop();
    barAnims.forEach((a) => a.setValue(0.35));
  }, [barAnims]);

  const startBars = useCallback(() => {
    barLoop.current?.stop();
    const loops = barAnims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 0.35 + ((i % 3) + 1) * 0.2,
            duration: 280 + i * 40,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.timing(anim, {
            toValue: 0.25,
            duration: 280 + i * 40,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: Platform.OS !== 'web',
          }),
        ])
      )
    );
    barLoop.current = Animated.parallel(loops);
    barLoop.current.start();
  }, [barAnims]);

  useEffect(() => {
    if (callState === 'listening' || callState === 'speaking') {
      startPulse();
      startBars();
    } else {
      stopPulse();
      stopBars();
    }
  }, [callState, startPulse, stopPulse, startBars, stopBars]);

  const interruptSpeech = useCallback(async () => {
    ttsAbort.current?.abort();
    ttsAbort.current = null;
    playbackDone.current?.();
    playbackDone.current = null;

    if (activeSound.current) {
      const sound = activeSound.current;
      activeSound.current = null;
      try {
        await sound.stopAsync();
        await sound.unloadAsync();
      } catch {
        /* ignore */
      }
    }
    setCallState((s) => (s === 'speaking' ? 'idle' : s));
  }, []);

  const tearDownCall = useCallback(() => {
    callActive.current = false;
    ttsAbort.current?.abort();
    ttsAbort.current = null;
    playbackDone.current?.();
    playbackDone.current = null;
    void interruptSpeech();
    void (async () => {
      if (!recording.current) return;
      const instance = recording.current;
      recording.current = null;
      try {
        const status = await instance.getStatusAsync();
        if (status.isRecording) await instance.stopAndUnloadAsync();
      } catch {
        /* ignore */
      }
    })();
  }, [interruptSpeech]);

  useFocusEffect(
    useCallback(() => {
      callActive.current = true;
      return () => {
        tearDownCall();
        stopPulse();
        stopBars();
      };
    }, [tearDownCall, stopPulse, stopBars])
  );

  useEffect(() => {
    if (!isDeepgramConfigured()) {
      Alert.alert(
        'Voice unavailable',
        'Add EXPO_PUBLIC_DEEPGRAM_API_KEY to .env and restart Expo to use voice coaching.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
      return;
    }

    (async () => {
      try {
        const { status } = await Audio.requestPermissionsAsync();
        if (status !== 'granted') return;
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
      } catch (error) {
        console.error('Audio setup failed:', error);
      }
    })();
  }, [router]);

  const startRecording = async () => {
    if (callState !== 'idle') return;

    try {
      if (recording.current) {
        try {
          await recording.current.stopAndUnloadAsync();
        } catch {
          /* ignore */
        }
        recording.current = null;
      }

      const { status } = await Audio.getPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Microphone access needed', 'Allow microphone access to use voice coaching.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      setCallState('listening');
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recording.current = newRecording;
    } catch (error) {
      console.error('Failed to start recording:', error);
      setCallState('idle');
      recording.current = null;
    }
  };

  const stopRecording = async (processAudio = true) => {
    if (!recording.current) return;

    const instance = recording.current;
    recording.current = null;

    if (processAudio) {
      setCallState('processing');
    } else {
      setCallState('idle');
    }

    try {
      const uri = instance.getURI();
      const status = await instance.getStatusAsync();
      if (status.isRecording) {
        await instance.stopAndUnloadAsync();
      }

      if (processAudio && uri) {
        const base64Audio = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
        await handleAudioInput(base64Audio);
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
      setCallState('idle');
    }
  };

  const preparePlaybackAudioMode = async () => {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  };

  const speakResponse = async (text: string) => {
    if (!callActive.current) return;
    setCallState('speaking');

    const abort = new AbortController();
    ttsAbort.current = abort;

    let audioUri: string | null = null;

    try {
      // Fetch TTS and switch to playback mode at the same time
      const [arrayBuffer] = await Promise.all([
        synthesizeCoachSpeech(text, abort.signal),
        preparePlaybackAudioMode(),
      ]);

      if (!callActive.current || abort.signal.aborted) return;

      audioUri = `${FileSystem.cacheDirectory}tts_${Date.now()}.mp3`;
      await FileSystem.writeAsStringAsync(audioUri, arrayBufferToBase64(arrayBuffer), {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (!callActive.current || abort.signal.aborted) return;

      const { sound } = await Audio.Sound.createAsync({ uri: audioUri }, { shouldPlay: true });

      if (!callActive.current || abort.signal.aborted) {
        try {
          await sound.unloadAsync();
        } catch {
          /* ignore */
        }
        return;
      }

      activeSound.current = sound;
      const uriToClean = audioUri;

      await new Promise<void>((resolve) => {
        playbackDone.current = resolve;
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            activeSound.current = null;
            playbackDone.current = null;
            void sound.unloadAsync();
            void FileSystem.deleteAsync(uriToClean, { idempotent: true });
            resolve();
          }
        });
      });
    } catch (error) {
      if (abort.signal.aborted || !callActive.current) return;
      console.error('TTS error:', error);
      showToast("Couldn't play the coach voice. Check your Deepgram key.");
      throw error;
    } finally {
      if (ttsAbort.current === abort) ttsAbort.current = null;
      if (audioUri && !activeSound.current) {
        void FileSystem.deleteAsync(audioUri, { idempotent: true });
      }
      if (callActive.current) {
        activeSound.current = null;
        setCallState('idle');
      }
    }
  };

  const handleAudioInput = async (audioBase64: string) => {
    if (!activeChat) {
      setCallState('idle');
      return;
    }

    if (!consumeCredit()) {
      setCallState('idle');
      Alert.alert(
        "You've run out of credits",
        'Each voice message uses 1 credit. Manage your plan in Settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Settings', onPress: () => router.push('/(tabs)/settings') },
        ]
      );
      return;
    }

    setCoachReply('');

    try {
      const history = activeChat.messages.map((msg) => ({
        role: msg.sender === 'user' ? ('user' as const) : ('model' as const),
        parts: [{ text: msg.text }],
      }));

      const { response: aiResponseText, goalUpdates, newGoals, userTranscript } = await getAiVoiceResponse(
        audioBase64,
        history,
        goals as Goal[],
        coachProfileSummary,
        chatMode,
        pastChatsMemory,
        checkInsMemory
      );

      if (!callActive.current) return;

      // Show text + start TTS immediately; persist chat/goals in parallel
      setCoachReply(aiResponseText);
      const speakPromise = speakResponse(aiResponseText);

      let updateMsg = '';
      if (newGoals.length > 0) {
        newGoals.forEach((newGoal) => {
          addGoal({
            title: newGoal.title,
            category: (newGoal.category as Goal['category']) || 'Other',
            status: 'Active',
            progress: 0,
            type: 'active',
          });
        });
        updateMsg = `Created ${newGoals.length} new goal${newGoals.length > 1 ? 's' : ''}`;
      }

      if (goalUpdates.length > 0) {
        goalUpdates.forEach((update) => {
          const goal = goals.find((g) => g.id === update.goalId);
          if (goal) {
            const newProgress = Math.min(100, Math.max(0, goal.progress + (update.progressChange || 0)));
            updateGoal(goal.id, { progress: newProgress });
          }
        });
        updateMsg = updateMsg
          ? `${updateMsg} · progress updated`
          : `Updated ${goalUpdates.length} goal${goalUpdates.length > 1 ? 's' : ''}`;
      }

      if (updateMsg) showToast(updateMsg);

      addMessageToChat(activeChat.id, {
        id: `${Date.now()}-user`,
        text: userTranscript?.trim() || '[Voice message]',
        sender: 'user',
        timestamp: Date.now(),
      });

      addMessageToChat(activeChat.id, {
        id: `${Date.now()}-ai`,
        text: aiResponseText,
        sender: 'ai',
        timestamp: Date.now(),
      });

      await speakPromise;
    } catch (error) {
      if (!callActive.current) return;
      console.error('Voice input error:', error);
      refundCredit();
      setCoachReply("I couldn't catch that. Tap the orb and try again.");
      setCallState('idle');
    }
  };

  const onOrbPress = () => {
    if (callState === 'idle') {
      void startRecording();
      return;
    }
    if (callState === 'listening') {
      void stopRecording(true);
      return;
    }
    if (callState === 'speaking') {
      void interruptSpeech();
    }
  };

  const endCall = () => {
    tearDownCall();
    router.back();
  };

  const active = callState === 'listening' || callState === 'speaking';
  const orbTint =
    callState === 'listening' ? 'rgba(34,197,94,0.22)' : callState === 'speaking' ? theme.primarySoft : theme.surface;

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topBar}>
          <Pressable onPress={endCall} style={styles.closeBtn} hitSlop={12}>
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
                {barAnims.map((anim, i) => (
                  <Animated.View
                    key={i}
                    style={[
                      styles.waveBar,
                      {
                        transform: [{ scaleY: anim }],
                        backgroundColor:
                          callState === 'listening'
                            ? theme.success
                            : callState === 'speaking'
                              ? theme.primary
                              : theme.textMuted,
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

        <ScrollView
          style={styles.replyScroll}
          contentContainerStyle={styles.replyScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {coachReply ? (
            <Text style={styles.replyText}>{coachReply}</Text>
          ) : (
            <Text style={styles.replyHint}>
              Your coach will respond here. Speak naturally — short turns work best.
            </Text>
          )}
        </ScrollView>

        <Pressable onPress={endCall} style={styles.endLink}>
          <Text style={styles.endLinkText}>End session</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    safeArea: {
      flex: 1,
    },
    topBar: {
      paddingHorizontal: 20,
      paddingTop: 4,
      alignItems: 'flex-start',
    },
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
    header: {
      alignItems: 'center',
      paddingTop: 8,
      paddingHorizontal: 32,
    },
    title: {
      color: theme.text,
      fontSize: 20,
      fontWeight: '600',
      marginBottom: 8,
    },
    status: {
      color: theme.textSecondary,
      fontSize: 16,
    },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: 260,
    },
    orbPressable: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    orbPressed: {
      opacity: 0.92,
    },
    glow: {
      position: 'absolute',
      width: 280,
      height: 280,
      borderRadius: 140,
    },
    orb: {
      width: 200,
      height: 200,
      borderRadius: 100,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    waveRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 56,
    },
    waveBar: {
      width: 5,
      height: 44,
      borderRadius: 3,
    },
    toast: {
      alignSelf: 'center',
      marginBottom: 8,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: 'rgba(34,197,94,0.12)',
      borderWidth: 1,
      borderColor: 'rgba(34,197,94,0.28)',
    },
    toastText: {
      color: theme.success,
      fontSize: 13,
      fontWeight: '600',
    },
    replyScroll: {
      maxHeight: 140,
      marginHorizontal: 28,
    },
    replyScrollContent: {
      flexGrow: 1,
      justifyContent: 'flex-end',
      paddingBottom: 8,
    },
    replyText: {
      color: theme.text,
      fontSize: 17,
      lineHeight: 26,
      textAlign: 'center',
    },
    replyHint: {
      color: theme.textMuted,
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
    },
    endLink: {
      alignItems: 'center',
      paddingVertical: 20,
      paddingBottom: 28,
    },
    endLinkText: {
      color: theme.textSecondary,
      fontSize: 15,
      fontWeight: '500',
    },
  });
}
