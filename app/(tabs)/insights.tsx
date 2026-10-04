import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from '@/constants/theme';
import { useChats } from '@/context/ChatsContext';
import type { CheckIn } from '@/store/useStore';
import { useStore } from '@/store/useStore';
import { addDays, format, isSameDay, parseISO, startOfWeek } from 'date-fns';
import { useRouter } from 'expo-router';
import { ChevronLeft, Lightbulb, MessageCircle, Share2, Target, TrendingUp, User } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColorScheme } from '@/hooks/use-color-scheme';
import Svg, { Circle, G } from 'react-native-svg';

export default function InsightsScreen() {
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? 'light'];
    const router = useRouter();
    const isDark = colorScheme === 'dark';
    const { goals, checkIns } = useStore();
    const { createReflectionDiscussionChat } = useChats();

    const styles = getStyles(theme, isDark);

    const sortedReflections = useMemo(() => {
        return [...checkIns].sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
    }, [checkIns]);

    const openReflectionDiscussion = (c: CheckIn) => {
        createReflectionDiscussionChat({
            checkInId: c.id,
            date: c.date,
            mood: c.mood,
            happiness: c.happiness,
            stress: c.stress,
            sleep: c.sleep,
            reflection: c.reflection || '',
            win: c.win || '',
            notes: c.notes || '',
        });
        router.push('/ai-coach');
    };

    // Calculate Insights
    const totalGoals = goals.length;
    const completedGoals = goals.filter(g => g.status === 'Completed').length;
    const totalReflections = checkIns.length;

    // Weekly Activity Calculation
    const weeklyData = useMemo(() => {
        const today = new Date();
        const start = startOfWeek(today, { weekStartsOn: 1 }); // Monday start

        const days = Array.from({ length: 7 }, (_, i) => {
            const date = addDays(start, i);
            const label = format(date, 'EEEEE'); // M, T, W, etc.

            // Count entries for this day
            const count = checkIns.filter(c => isSameDay(new Date(c.date), date)).length;
            // Mock height logic (max 3 entries = 100%)
            const height = Math.min((count / 3) * 100, 100);

            return { label, height, isToday: isSameDay(date, today) };
        });

        return days;
    }, [checkIns]);

    // Category Distribution Calculation
    const categoryData = useMemo(() => {
        if (totalGoals === 0) return [];

        const counts: Record<string, number> = {};
        goals.forEach(g => {
            counts[g.category] = (counts[g.category] || 0) + 1;
        });

        const data = Object.entries(counts)
            .map(([label, count]) => ({
                label,
                value: Math.round((count / totalGoals) * 100),
                color: getCategoryColor(label)
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 3); // Top 3

        return data;
    }, [goals, totalGoals]);

    // Top Category Calculation
    const topCategory = categoryData.length > 0 ? categoryData[0] : null;

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                    <ChevronLeft size={24} color={theme.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Your Progress</Text>
                <View style={styles.headerRight}>
                    <TouchableOpacity style={styles.iconButton}>
                        <Share2 size={22} color={theme.text} />
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>

                {/* Stats Grid */}
                <View style={styles.statsGrid}>
                    <View style={styles.statCard}>
                        <View style={styles.statIconContainer}>
                            <Target size={20} color="#2563EB" />
                            <Text style={styles.statLabel}>Goals Set</Text>
                        </View>
                        <Text style={styles.statValue}>{totalGoals}</Text>
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
                        <Text style={styles.statValue}>{totalReflections}</Text>
                        <Text style={styles.statSubText}>Entries logged</Text>
                    </View>
                </View>

                {/* Weekly Activity */}
                <View style={styles.card}>
                    <Text style={styles.cardSectionTitle}>WEEKLY ACTIVITY</Text>
                    <View style={styles.activityHeader}>
                        <Text style={styles.activityValue}>{totalReflections} check-ins</Text>
                        <Text style={styles.activityPeriod}>This Week</Text>
                    </View>

                    <View style={styles.barChartContainer}>
                        {weeklyData.map((day, index) => (
                            <View key={index} style={styles.barColumn}>
                                <View style={styles.barTrack}>
                                    <View
                                        style={[
                                            styles.barFill,
                                            {
                                                height: `${Math.max(day.height, 10)}%`, // Min height for visibility
                                                backgroundColor: day.isToday ? theme.primary : (day.height > 0 ? '#60A5FA' : theme.surfaceElevated)
                                            }
                                        ]}
                                    />
                                </View>
                                <Text style={[styles.barLabel, day.isToday && styles.barLabelActive]}>{day.label}</Text>
                            </View>
                        ))}
                    </View>
                </View>

                {/* Reflection history */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Reflections</Text>
                    <Text style={styles.reflectionIntro}>
                        Discuss a check-in with your coach to explore patterns and next moves.
                    </Text>
                    {sortedReflections.length === 0 ? (
                        <Text style={styles.emptyReflectionText}>No reflections yet. Log a daily check-in to see them here.</Text>
                    ) : (
                        sortedReflections.slice(0, 12).map((c) => {
                            const when = (() => {
                                try {
                                    return format(parseISO(c.date), 'MMM d, yyyy');
                                } catch {
                                    return c.date;
                                }
                            })();
                            const preview = (c.reflection || c.notes || '').trim() || 'No written notes';
                            return (
                                <View key={c.id} style={styles.reflectionRow}>
                                    <View style={styles.reflectionTextCol}>
                                        <Text style={styles.reflectionDate}>{when}</Text>
                                        <Text style={styles.reflectionMood}>
                                            Mood: {c.mood} · Happiness {c.happiness}/10 · Stress {c.stress}/10 · Sleep {c.sleep}/10
                                        </Text>
                                        <Text style={styles.reflectionPreview} numberOfLines={2}>
                                            {preview}
                                        </Text>
                                    </View>
                                    <TouchableOpacity
                                        style={styles.discussButton}
                                        onPress={() => openReflectionDiscussion(c)}
                                    >
                                        <MessageCircle size={16} color="#fff" />
                                        <Text style={styles.discussButtonText}>Discuss</Text>
                                    </TouchableOpacity>
                                </View>
                            );
                        })
                    )}
                </View>

                {/* Focus Areas */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Focus Areas</Text>

                    {categoryData.length > 0 ? (
                        <View style={styles.focusContainer}>
                            {/* Donut Chart */}
                            <View style={styles.donutContainer}>
                                <Svg width="120" height="120" viewBox="0 0 100 100">
                                    <G rotation="-90" origin="50, 50">
                                        {/* Background Circle */}
                                        <Circle
                                            cx="50"
                                            cy="50"
                                            r="40"
                                            stroke={isDark ? "#334155" : "#F1F5F9"}
                                            strokeWidth="10"
                                            fill="transparent"
                                        />
                                        {/* Dynamic Segments */}
                                        {categoryData.map((cat, i) => {
                                            const offset = categoryData
                                                .slice(0, i)
                                                .reduce((acc, c) => acc + c.value, 0);
                                            const dashArray = `${cat.value * 2.51} ${100 * 2.51}`;
                                            const dashOffset = `-${offset * 2.51}`;

                                            return (
                                                <Circle
                                                    key={cat.label}
                                                    cx="50"
                                                    cy="50"
                                                    r="40"
                                                    stroke={cat.color}
                                                    strokeWidth="10"
                                                    fill="transparent"
                                                    strokeDasharray={dashArray}
                                                    strokeDashoffset={dashOffset}
                                                />
                                            );
                                        })}
                                    </G>
                                </Svg>
                                <View style={styles.donutCenter}>
                                    <Text style={styles.donutValue}>{topCategory?.value}%</Text>
                                    <Text style={styles.donutLabel}>{topCategory?.label.toUpperCase()}</Text>
                                </View>
                            </View>

                            {/* Legend */}
                            <View style={styles.legendContainer}>
                                {categoryData.map((cat) => (
                                    <View key={cat.label} style={styles.legendRow}>
                                        <View style={[styles.legendDot, { backgroundColor: cat.color }]} />
                                        <Text style={styles.legendLabel}>{cat.label}</Text>
                                        <Text style={styles.legendValue}>{cat.value}%</Text>
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

                {/* Coach Insight */}
                <View style={[styles.card, styles.insightCard]}>
                    <View style={styles.insightHeader}>
                        <View style={styles.insightIconBox}>
                            <Lightbulb size={20} color="#2563EB" fill="#2563EB" />
                        </View>
                        <Text style={styles.insightTitle}>Coach Insight</Text>
                    </View>
                    <Text style={styles.insightText}>
                        {totalReflections > 0
                            ? "Great job maintaining consistency! Regular reflection is key to long-term growth. Keep checking in daily."
                            : "Start your journey by logging your first daily reflection. It only takes a minute!"
                        }
                    </Text>
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const getCategoryColor = (category: string) => {
    switch (category) {
        case 'Career': return '#2563EB'; // Blue
        case 'Health': return '#22C55E'; // Green
        case 'Fitness': return '#16A34A'; // Green-dark
        case 'Learning': return '#7C3AED'; // Purple
        case 'Finance': return '#F59E0B'; // Amber
        case 'Social': return '#F43F5E'; // Rose
        default: return '#64748B'; // Slate
    }
};

const getStyles = (theme: any, isDark: boolean) => StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: theme.background},
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingVertical: 12},
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: theme.text},
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16},
    iconButton: {
        padding: 4},
    scrollContainer: {
        flex: 1},
    contentContainer: {
        padding: 24,
        gap: 20},
    // Stats Grid
    statsGrid: {
        flexDirection: 'row',
        gap: 16},
    statCard: {
        flex: 1,
        backgroundColor: theme.card,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: theme.border},
    statIconContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12},
    statLabel: {
        fontSize: 13,
        color: '#64748B',
        fontWeight: '500'},
    statValue: {
        fontSize: 32,
        fontWeight: '700',
        color: theme.text,
        marginBottom: 8},
    statTrendRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4},
    statTrendText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#22C55E'},
    statSubText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#2563EB'},

    // Generic Card
    card: {
        backgroundColor: theme.card,
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: theme.border},
    cardSectionTitle: {
        fontSize: 12,
        fontWeight: '600',
        color: '#94A3B8',
        marginBottom: 4,
        letterSpacing: 1},
    cardTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: theme.text,
        marginBottom: 20},

    // Weekly Activity
    activityHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginBottom: 24},
    activityValue: {
        fontSize: 24,
        fontWeight: '700',
        color: theme.text},
    activityPeriod: {
        fontSize: 14,
        color: '#64748B'},
    barChartContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        height: 120,
        alignItems: 'flex-end'},
    barColumn: {
        alignItems: 'center',
        gap: 8,
        flex: 1},
    barTrack: {
        height: '100%',
        width: 6,
        backgroundColor: 'transparent',
        justifyContent: 'flex-end',
        borderRadius: 3},
    barFill: {
        width: '100%',
        borderRadius: 3},
    barLabel: {
        fontSize: 12,
        color: '#94A3B8',
        fontWeight: '500'},
    barLabelActive: {
        color: '#2563EB',
        fontWeight: '700'},

    // Focus Areas
    focusContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 24},
    donutContainer: {
        width: 120,
        height: 120,
        justifyContent: 'center',
        alignItems: 'center'},
    donutCenter: {
        position: 'absolute',
        alignItems: 'center'},
    donutValue: {
        fontSize: 24,
        fontWeight: '700',
        color: theme.text},
    donutLabel: {
        fontSize: 10,
        fontWeight: '700',
        color: '#94A3B8',
        letterSpacing: 1,
        marginTop: 2},
    legendContainer: {
        flex: 1,
        gap: 16},
    legendRow: {
        flexDirection: 'row',
        alignItems: 'center'},
    legendDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginRight: 12},
    legendLabel: {
        fontSize: 15,
        color: theme.text,
        fontWeight: '500',
        flex: 1},
    legendValue: {
        fontSize: 15,
        color: '#94A3B8'},
    emptyStateBox: {
        padding: 20,
        alignItems: 'center'},
    emptyText: {
        color: '#94A3B8',
        fontStyle: 'italic'},

    // Insight Card
    insightCard: {
        backgroundColor: isDark ? '#1e293b' : '#EFF6FF',
        borderWidth: 1,
        borderColor: isDark ? '#334155' : '#DBEAFE'},
    insightHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 12},
    insightIconBox: {
        backgroundColor: '#DBEAFE',
        borderRadius: 8,
        padding: 6},
    insightTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#2563EB'},
    insightText: {
        fontSize: 15,
        color: isDark ? '#cbd5e1' : '#475569',
        lineHeight: 24},

    // History Link
    historyLink: {
        alignItems: 'center',
        paddingVertical: 8},
    historyLinkText: {
        color: '#2563EB',
        fontSize: 15,
        fontWeight: '600'},
    reflectionIntro: {
        fontSize: 14,
        color: '#64748B',
        marginBottom: 16,
        lineHeight: 20},
    emptyReflectionText: {
        fontSize: 14,
        color: '#94A3B8',
        fontStyle: 'italic'},
    reflectionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(148,163,184,0.25)'},
    reflectionTextCol: {
        flex: 1,
        minWidth: 0},
    reflectionDate: {
        fontSize: 13,
        fontWeight: '700',
        color: theme.text,
        marginBottom: 4},
    reflectionMood: {
        fontSize: 12,
        color: '#64748B',
        marginBottom: 6},
    reflectionPreview: {
        fontSize: 14,
        color: theme.text,
        lineHeight: 20},
    discussButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#2563EB',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 12},
    discussButtonText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '700'}});
