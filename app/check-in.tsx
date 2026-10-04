import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from '@/constants/theme';
import { useStore } from '@/store/useStore';
import Slider from '@react-native-community/slider';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useKeyboardBottomInset } from '@/hooks/use-keyboard-bottom-inset';

const MOODS = [
    { id: 'energized', label: 'Energized', icon: '⚡', color: '#2563EB', bg: '#EFF6FF' }, // Blue
    { id: 'balanced', label: 'Balanced', icon: '⚖️', color: '#059669', bg: '#ECFDF5' }, // Emerald
    { id: 'calm', label: 'Calm', icon: '🍵', color: '#0D9488', bg: '#F0FDFA' }, // Teal
    { id: 'anxious', label: 'Anxious', icon: '☁️', color: '#64748B', bg: '#F1F5F9' }, // Slate
    { id: 'tired', label: 'Tired', icon: '😴', color: '#D97706', bg: '#FFFBEB' }, // Amber
    { id: 'productive', label: 'Productive', icon: '🚀', color: '#7C3AED', bg: '#F5F3FF' }, // Violet
    { id: 'focused', label: 'Focused', icon: '🎯', color: '#DC2626', bg: '#FEF2F2' }, // Red
    { id: 'overwhelmed', label: 'Overwhelmed', icon: '🌊', color: '#475569', bg: '#F8FAFC' }, // Slate-darker
];

export default function CheckInScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? 'light'];
    const isDark = colorScheme === 'dark';
    const { bottomInset, isOpen: keyboardOpen } = useKeyboardBottomInset();
    const { user, addCheckIn } = useStore();

    const [selectedMoods, setSelectedMoods] = useState<string[]>(['energized']);
    const [energy, setEnergy] = useState(7);
    const [stress, setStress] = useState(3);
    const [sleep, setSleep] = useState(8);
    const [reflection, setReflection] = useState('');
    const [win, setWin] = useState('');

    const toggleMood = (id: string) => {
        setSelectedMoods(prev => {
            if (prev.includes(id)) {
                if (prev.length <= 1) return prev;
                return prev.filter(m => m !== id);
            }
            return [...prev, id];
        });
    };

    const handleSubmit = () => {
        const mood = selectedMoods[0] ?? 'balanced';
        const notes = [reflection, win].filter(Boolean).join('\n\n');
        addCheckIn({
            date: new Date().toISOString(),
            mood,
            notes,
            energy,
            happiness: energy,
            stress,
            sleep,
            reflection: reflection.trim(),
            win: win.trim(),
        });
        router.back();
    };

    const styles = getStyles(theme, isDark);

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={{ flex: 1, paddingBottom: keyboardOpen ? bottomInset : 0 }}>
                <ScrollView
                    style={styles.container}
                    contentContainerStyle={styles.contentContainer}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="interactive"
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                            <ChevronLeft size={24} color={theme.text} />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Daily Check-In</Text>
                        <View style={{ width: 40 }} />
                    </View>

                    <Text style={styles.title}>How are you feeling, {user?.name?.split(' ')[0] || 'Friend'}?</Text>
                    <Text style={styles.subtitle}>Take a moment to ground yourself.</Text>

                    {/* Mood Section */}
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>SELECT YOUR MOOD</Text>
                        <View style={styles.moodGrid}>
                            {MOODS.map((mood) => {
                                const isSelected = selectedMoods.includes(mood.id);
                                return (
                                    <TouchableOpacity
                                        key={mood.id}
                                        style={[
                                            styles.moodChip,
                                            {
                                                backgroundColor: isSelected ? '#2563EB' : theme.card,
                                                borderColor: isSelected ? '#2563EB' : theme.border}
                                        ]}
                                        onPress={() => toggleMood(mood.id)}
                                    >
                                        <Text style={[
                                            styles.moodText,
                                            { color: isSelected ? '#FFF' : theme.text }
                                        ]}>
                                            {mood.icon} {mood.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>

                    {/* Metrics Section */}
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>METRICS</Text>

                        {/* Energy Slider */}
                        <View style={styles.metricCard}>
                            <View style={styles.metricHeader}>
                                <Text style={styles.metricName}>Happiness</Text>
                                <Text style={styles.metricValue}>{energy}</Text>
                            </View>
                            <Slider
                                style={styles.slider}
                                minimumValue={1}
                                maximumValue={10}
                                step={1}
                                value={energy}
                                onValueChange={setEnergy}
                                minimumTrackTintColor="#2563EB"
                                maximumTrackTintColor={theme.border}
                                thumbTintColor="#2563EB"
                            />
                            <View style={styles.metricLabels}>
                                <Text style={styles.metricLabelLeft}>LOW</Text>
                                <Text style={styles.metricLabelRight}>HIGH</Text>
                            </View>
                        </View>

                        {/* Stress Slider */}
                        <View style={styles.metricCard}>
                            <View style={styles.metricHeader}>
                                <Text style={styles.metricName}>Stress</Text>
                                <Text style={styles.metricValue}>{stress}</Text>
                            </View>
                            <Slider
                                style={styles.slider}
                                minimumValue={1}
                                maximumValue={10}
                                step={1}
                                value={stress}
                                onValueChange={setStress}
                                minimumTrackTintColor="#2563EB"
                                maximumTrackTintColor={theme.border}
                                thumbTintColor="#2563EB"
                            />
                            <View style={styles.metricLabels}>
                                <Text style={styles.metricLabelLeft}>CALM</Text>
                                <Text style={styles.metricLabelRight}>STRESSED</Text>
                            </View>
                        </View>

                        {/* Sleep Slider */}
                        <View style={styles.metricCard}>
                            <View style={styles.metricHeader}>
                                <Text style={styles.metricName}>Sleep Quality</Text>
                                <Text style={styles.metricValue}>{sleep}</Text>
                            </View>
                            <Slider
                                style={styles.slider}
                                minimumValue={1}
                                maximumValue={10}
                                step={1}
                                value={sleep}
                                onValueChange={setSleep}
                                minimumTrackTintColor="#2563EB"
                                maximumTrackTintColor={theme.border}
                                thumbTintColor="#2563EB"
                            />
                            <View style={styles.metricLabels}>
                                <Text style={styles.metricLabelLeft}>POOR</Text>
                                <Text style={styles.metricLabelRight}>EXCELLENT</Text>
                            </View>
                        </View>
                    </View>

                    {/* Reflect Section */}
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>REFLECT</Text>

                        <Text style={styles.inputLabel}>What's on your mind today?</Text>
                        <TextInput
                            style={styles.textArea}
                            placeholder="Start typing..."
                            placeholderTextColor="#94A3B8"
                            multiline
                            value={reflection}
                            onChangeText={setReflection}
                        />

                        <Text style={styles.inputLabel}>What is one small win you're aiming for?</Text>
                        <TextInput
                            style={styles.textArea}
                            placeholder="Focus on one achievable thing..."
                            placeholderTextColor="#94A3B8"
                            multiline
                            value={win}
                            onChangeText={setWin}
                        />
                    </View>

                    {/* Submit Action */}
                    <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
                        <Text style={styles.submitButtonText}>Submit Check-In</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.skipButton} onPress={() => router.back()}>
                        <Text style={styles.skipButtonText}>Skip for now</Text>
                    </TouchableOpacity>

                    <View style={{ height: 40 }} />

                </ScrollView>
            </View>
        </SafeAreaView>
    );
}

const getStyles = (theme: any, isDark: boolean) => StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: theme.background},
    keyboardView: {
        flex: 1},
    container: {
        flex: 1},
    contentContainer: {
        padding: 24},
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 32},
    backButton: {
        padding: 8,
        marginLeft: -8},
    headerTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.text},
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: theme.text,
        marginBottom: 8,
        textAlign: 'center'},
    subtitle: {
        fontSize: 16,
        color: '#64748B',
        textAlign: 'center',
        marginBottom: 32},
    section: {
        marginBottom: 32},
    sectionLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#94A3B8',
        marginBottom: 16,
        letterSpacing: 1,
        textTransform: 'uppercase'},
    moodGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        justifyContent: 'center'},
    moodChip: {
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 24,
        borderWidth: 1},
    moodText: {
        fontSize: 15,
        fontWeight: '500'},
    metricCard: {
        backgroundColor: theme.card,
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: theme.border},
    metricHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12},
    metricName: {
        fontSize: 16,
        fontWeight: '500',
        color: theme.text},
    metricValue: {
        fontSize: 16,
        fontWeight: '700',
        color: '#2563EB'},
    slider: {
        width: '100%',
        height: 40},
    metricLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 4},
    metricLabelLeft: {
        fontSize: 11,
        color: '#94A3B8',
        fontWeight: '600'},
    metricLabelRight: {
        fontSize: 11,
        color: '#94A3B8',
        fontWeight: '600'},
    inputLabel: {
        fontSize: 15,
        fontWeight: '500',
        color: theme.text,
        marginBottom: 12},
    textArea: {
        backgroundColor: theme.card,
        borderRadius: 16,
        padding: 16,
        height: 120,
        fontSize: 15,
        color: theme.text,
        textAlignVertical: 'top',
        marginBottom: 24,
        borderWidth: 1,
        borderColor: theme.border},
    submitButton: {
        backgroundColor: '#2563EB',
        paddingVertical: 18,
        borderRadius: 30,
        alignItems: 'center',
        marginBottom: 16,
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4},
    submitButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700'},
    skipButton: {
        paddingVertical: 12,
        alignItems: 'center'},
    skipButtonText: {
        color: '#64748B',
        fontSize: 15,
        fontWeight: '500'}});
