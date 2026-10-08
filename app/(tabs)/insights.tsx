import { router } from 'expo-router';
import { ChevronLeft, Lightbulb, MessageCircle, Share2, Target, TrendingUp, User } from 'lucide-react-native';
import { useMemo } from 'react';
import { ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, G } from 'react-native-svg';

import { localDateKey } from '@/features/dates';
import { focusAreas, formatCheckInDate, moodLabels, weekActivity } from '@/features/insights/insights';
import { createConversation } from '@/services/conversationsService';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { useUserDataStore } from '@/stores/userDataStore';
import type { CheckIn } from '@/types/models';
import { theme } from '@/ui';

const CIRCUMFERENCE = 2.51; // 2πr / 100 for r = 40, so values are percentages

export default function InsightsScreen() {
  const uid = useAuthStore((s) => s.user?.uid);
  const goals = useUserDataStore((s) => s.goals.items);
  const checkIns = useUserDataStore((s) => s.checkIns.items);
  const setActive = useChatStore((s) => s.setActive);

  const today = localDateKey();
  const reflections = useMemo(() => [...checkIns].sort((a, b) => b.date.localeCompare(a.date)), [checkIns]);
  const week = useMemo(() => weekActivity(checkIns.map((c) => c.date), today), [checkIns, today]);
  const areas = useMemo(() => focusAreas(goals), [goals]);
  const completedGoals = goals.filter((g) => g.status === 'completed').length;
  const thisWeek = week.filter((d) => d.checkedIn).length;
  const top = areas[0];

  const discuss = (checkIn: CheckIn) => {
    if (!uid) return;
    const id = createConversation(uid, { mode: 'reflection', reflectionCheckInId: checkIn.date });
    setActive(id);
    router.push({ pathname: '/ai-coach', params: { id } });
  };

  const share = () =>
    void Share.share({
      message: `My BYT progress: ${goals.length} goals set (${completedGoals} completed) and ${checkIns.length} daily check-ins.`,
    }).catch(() => undefined);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ChevronLeft size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Your Progress</Text>
        <TouchableOpacity style={styles.iconButton} onPress={share} accessibilityRole="button" accessibilityLabel="Share progress">
          <Share2 size={22} color={theme.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <View style={styles.statIconContainer}>
              <Target size={20} color="#2563EB" />
              <Text style={styles.statLabel}>Goals Set</Text>
            </View>
            <Text style={styles.statValue}>{goals.length}</Text>
            <View style={styles.statTrendRow}>
              <TrendingUp size={14} color="#22C55E" />
              <Text style={styles.statTrendText}>{completedGoals} Completed</Text>
            </View>
          </View>
          <View style={styles.statCard}>
            <View style={styles.statIconContainer}>
              <User size={20} color="#2563EB" />
              <Text style={styles.statLabel}>Reflections</Text>
            </View>
            <Text style={styles.statValue}>{checkIns.length}</Text>
            <Text style={styles.statSubText}>Entries logged</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>WEEKLY ACTIVITY</Text>
          <View style={styles.activityHeader}>
            <Text style={styles.activityValue}>
              {thisWeek} check-in{thisWeek === 1 ? '' : 's'}
            </Text>
            <Text style={styles.activityPeriod}>This Week</Text>
          </View>
          <View style={styles.barChartContainer}>
            {week.map((day) => (
              <View key={day.date} style={styles.barColumn}>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        height: day.checkedIn ? '100%' : '10%',
                        backgroundColor: day.isToday ? theme.primary : day.checkedIn ? '#60A5FA' : theme.surfaceElevated,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.barLabel, day.isToday && styles.barLabelActive]}>{day.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Reflections</Text>
          <Text style={styles.reflectionIntro}>Discuss a check-in with your coach to explore patterns and next moves.</Text>
          {reflections.length === 0 ? (
            <Text style={styles.emptyReflectionText}>No reflections yet. Log a daily check-in to see them here.</Text>
          ) : (
            reflections.slice(0, 12).map((c) => (
              <View key={c.id} style={styles.reflectionRow}>
                <View style={styles.reflectionTextCol}>
                  <Text style={styles.reflectionDate}>{formatCheckInDate(c.date)}</Text>
                  <Text style={styles.reflectionMood}>
                    Mood: {moodLabels(c)} · Happiness {c.happiness}/10 · Stress {c.stress}/10 · Sleep {c.sleep}/10
                  </Text>
                  <Text style={styles.reflectionPreview} numberOfLines={2}>
                    {(c.reflection || c.win || '').trim() || 'No written notes'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.discussButton}
                  onPress={() => discuss(c)}
                  accessibilityRole="button"
                  accessibilityLabel={`Discuss check-in from ${formatCheckInDate(c.date)}`}
                >
                  <MessageCircle size={16} color="#fff" />
                  <Text style={styles.discussButtonText}>Discuss</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Focus Areas</Text>
          {top ? (
            <View style={styles.focusContainer}>
              <View style={styles.donutContainer}>
                <Svg width="120" height="120" viewBox="0 0 100 100">
                  <G rotation="-90" origin="50, 50">
                    <Circle cx="50" cy="50" r="40" stroke="#334155" strokeWidth="10" fill="transparent" />
                    {areas.map((area, i) => {
                      const offset = areas.slice(0, i).reduce((sum, a) => sum + a.value, 0);
                      return (
                        <Circle
                          key={area.category}
                          cx="50"
                          cy="50"
                          r="40"
                          stroke={area.color}
                          strokeWidth="10"
                          fill="transparent"
                          strokeDasharray={`${area.value * CIRCUMFERENCE} ${100 * CIRCUMFERENCE}`}
                          strokeDashoffset={`-${offset * CIRCUMFERENCE}`}
                        />
                      );
                    })}
                  </G>
                </Svg>
                <View style={styles.donutCenter}>
                  <Text style={styles.donutValue}>{top.value}%</Text>
                  <Text style={styles.donutLabel}>{top.label.toUpperCase()}</Text>
                </View>
              </View>
              <View style={styles.legendContainer}>
                {areas.map((area) => (
                  <View key={area.category} style={styles.legendRow}>
                    <View style={[styles.legendDot, { backgroundColor: area.color }]} />
                    <Text style={styles.legendLabel}>{area.label}</Text>
                    <Text style={styles.legendValue}>{area.value}%</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.emptyStateBox}>
              <Text style={styles.emptyText}>Add goals to see your focus distribution.</Text>
            </View>
          )}
        </View>

        <View style={[styles.card, styles.insightCard]}>
          <View style={styles.insightHeader}>
            <View style={styles.insightIconBox}>
              <Lightbulb size={20} color="#2563EB" fill="#2563EB" />
            </View>
            <Text style={styles.insightTitle}>Coach Insight</Text>
          </View>
          <Text style={styles.insightText}>
            {checkIns.length > 0
              ? 'Great job maintaining consistency! Regular reflection is key to long-term growth. Keep checking in daily.'
              : 'Start your journey by logging your first daily reflection. It only takes a minute!'}
          </Text>
        </View>

        <View style={styles.bottomSpace} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: theme.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
  iconButton: { padding: 4 },
  contentContainer: { padding: 24, gap: 20 },
  statsGrid: { flexDirection: 'row', gap: 16 },
  statCard: { flex: 1, backgroundColor: theme.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.border },
  statIconContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  statLabel: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  statValue: { fontSize: 32, fontWeight: '700', color: theme.text, marginBottom: 8 },
  statTrendRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statTrendText: { fontSize: 12, fontWeight: '600', color: '#22C55E' },
  statSubText: { fontSize: 12, fontWeight: '600', color: '#2563EB' },
  card: { backgroundColor: theme.card, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: theme.border },
  cardSectionTitle: { fontSize: 12, fontWeight: '600', color: '#94A3B8', marginBottom: 4, letterSpacing: 1 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: theme.text, marginBottom: 20 },
  activityHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24 },
  activityValue: { fontSize: 24, fontWeight: '700', color: theme.text },
  activityPeriod: { fontSize: 14, color: '#64748B' },
  barChartContainer: { flexDirection: 'row', justifyContent: 'space-between', height: 120, alignItems: 'flex-end' },
  barColumn: { alignItems: 'center', gap: 8, flex: 1 },
  barTrack: { height: 92, width: 6, justifyContent: 'flex-end', borderRadius: 3 },
  barFill: { width: '100%', borderRadius: 3 },
  barLabel: { fontSize: 12, color: '#94A3B8', fontWeight: '500' },
  barLabelActive: { color: '#2563EB', fontWeight: '700' },
  focusContainer: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  donutContainer: { width: 120, height: 120, justifyContent: 'center', alignItems: 'center' },
  donutCenter: { position: 'absolute', alignItems: 'center' },
  donutValue: { fontSize: 24, fontWeight: '700', color: theme.text },
  donutLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 1, marginTop: 2 },
  legendContainer: { flex: 1, gap: 16 },
  legendRow: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  legendLabel: { fontSize: 15, color: theme.text, fontWeight: '500', flex: 1 },
  legendValue: { fontSize: 15, color: '#94A3B8' },
  emptyStateBox: { padding: 20, alignItems: 'center' },
  emptyText: { color: '#94A3B8', fontStyle: 'italic' },
  insightCard: { backgroundColor: '#1e293b', borderColor: '#334155' },
  insightHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  insightIconBox: { backgroundColor: '#DBEAFE', borderRadius: 8, padding: 6 },
  insightTitle: { fontSize: 16, fontWeight: '700', color: '#2563EB' },
  insightText: { fontSize: 15, color: '#cbd5e1', lineHeight: 24 },
  reflectionIntro: { fontSize: 14, color: '#64748B', marginBottom: 16, lineHeight: 20 },
  emptyReflectionText: { fontSize: 14, color: '#94A3B8', fontStyle: 'italic' },
  reflectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148,163,184,0.25)',
  },
  reflectionTextCol: { flex: 1, minWidth: 0 },
  reflectionDate: { fontSize: 13, fontWeight: '700', color: theme.text, marginBottom: 4 },
  reflectionMood: { fontSize: 12, color: '#64748B', marginBottom: 6 },
  reflectionPreview: { fontSize: 14, color: theme.text, lineHeight: 20 },
  discussButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  discussButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  bottomSpace: { height: 40 },
});
