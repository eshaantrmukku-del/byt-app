import { SafeAreaView } from "react-native-safe-area-context";
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Platform } from "react-native";
import { useRouter } from 'expo-router';
import { ChevronLeft, Save, BookOpen } from 'lucide-react-native';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useStore } from '@/store/useStore';

export default function JournalScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? 'light'];
    const isDark = colorScheme === 'dark';
    const journalEntries = useStore((state) => state.journalEntries);
    const addJournalEntry = useStore((state) => state.addJournalEntry);
    const [entry, setEntry] = useState(() => {
        const saved = useStore.getState().journalEntries;
        return saved.length > 0 ? saved[saved.length - 1].text : '';
    });
    const touched = useRef(false);

    useEffect(() => {
        if (touched.current) return;
        const latest = journalEntries[journalEntries.length - 1];
        setEntry(latest?.text ?? '');
    }, [journalEntries]);

    const handleSave = () => {
        const text = entry.trim();
        const latest = useStore.getState().journalEntries.at(-1);
        if (text && text !== latest?.text) {
            addJournalEntry({
                date: new Date().toISOString(),
                text,
            });
        }
        router.back();
    };

    const styles = getStyles(theme, isDark);

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ChevronLeft size={24} color={theme.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Journal</Text>
                <TouchableOpacity onPress={handleSave} style={styles.saveButton}>
                    <Save size={20} color="#fff" />
                    <Text style={styles.saveButtonText}>Save</Text>
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
                <View style={styles.dateCard}>
                    <Text style={styles.dateText}>
                        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    </Text>
                    <Text style={styles.promptText}>What's on your mind today?</Text>
                </View>

                <TextInput
                    style={styles.input}
                    multiline
                    placeholder="Start writing..."
                    placeholderTextColor="#94A3B8"
                    value={entry}
                    onChangeText={(text) => {
                        touched.current = true;
                        setEntry(text);
                    }}
                    textAlignVertical="top"
                />
            </ScrollView>
        </SafeAreaView>
    );
}

const getStyles = (theme: any, isDark: boolean) => StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: theme.background},
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: theme.border},
    backButton: {
        padding: 8,
        marginLeft: -8},
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: theme.text},
    saveButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#2563EB',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
        gap: 4},
    saveButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 14},
    content: {
        flex: 1},
    contentContainer: {
        padding: 24},
    dateCard: {
        marginBottom: 20},
    dateText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#94A3B8',
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 1},
    promptText: {
        fontSize: 24,
        fontWeight: '700',
        color: theme.text},
    input: {
        flex: 1,
        fontSize: 16,
        color: theme.text,
        lineHeight: 24,
        minHeight: 300,
        textAlignVertical: 'top'}});
