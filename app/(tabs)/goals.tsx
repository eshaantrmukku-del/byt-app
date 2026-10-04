import { SafeAreaView } from "react-native-safe-area-context";
import { Colors } from '@/constants/theme';
import { useStore, type Goal } from '@/store/useStore';
import { CheckCircle, Circle, Plus, X } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function GoalsScreen() {
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? 'light'];
    const isDark = colorScheme === 'dark';
    const { goals, addGoal, updateGoal } = useStore();

    const [filter, setFilter] = useState('All');
    const [modalVisible, setModalVisible] = useState(false);
    const [newGoalTitle, setNewGoalTitle] = useState('');
    const [newGoalCategory, setNewGoalCategory] = useState('Career');

    const filteredGoals = useMemo(
        () => (filter === 'All' ? goals : goals.filter(g => g.status === filter)),
        [goals, filter]
    );

    const handleAddGoal = () => {
        if (!newGoalTitle.trim()) return;
        addGoal({
            title: newGoalTitle.trim(),
            category: newGoalCategory as Goal['category'],
            status: 'Active',
            progress: 0});
        setNewGoalTitle('');
        setModalVisible(false);
    };

    const toggleStatus = useCallback((id: string, currentStatus: string) => {
        const newStatus = currentStatus === 'Completed' ? 'Active' : 'Completed';
        const progress = newStatus === 'Completed' ? 100 : 0;
        updateGoal(id, { status: newStatus as Goal['status'], progress });
    }, [updateGoal]);

    const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);

    const renderGoal = useCallback(
        ({ item }: { item: Goal }) => (
            <View style={styles.goalCard}>
                <View style={styles.goalHeader}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.goalCategory}>{item.category}</Text>
                        <Text style={styles.goalTitle}>{item.title}</Text>
                    </View>
                    <TouchableOpacity
                        onPress={() => toggleStatus(item.id, item.status)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        {item.status === 'Completed' ? (
                            <CheckCircle size={24} color={theme.primary} />
                        ) : (
                            <Circle size={24} color={theme.icon} />
                        )}
                    </TouchableOpacity>
                </View>

                <View style={styles.progressContainer}>
                    <View style={styles.progressBarBg}>
                        <View style={[styles.progressBarFill, { width: `${Math.min(100, Math.max(0, item.progress))}%` }]} />
                    </View>
                    <Text style={styles.progressText}>{item.progress}%</Text>
                </View>
            </View>
        ),
        [styles, theme.primary, theme.icon, toggleStatus]
    );

    return (
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
            <View style={styles.header}>
                <Text style={styles.title}>My Goals</Text>
                <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
                    <Plus size={24} color="#fff" />
                </TouchableOpacity>
            </View>

            <View style={styles.filterContainer}>
                {['All', 'Active', 'Completed'].map(f => (
                    <TouchableOpacity
                        key={f}
                        onPress={() => setFilter(f)}
                        style={[
                            styles.filterChip,
                            filter === f && styles.filterChipActive
                        ]}
                    >
                        <Text style={[
                            styles.filterText,
                            filter === f && styles.filterTextActive
                        ]}>{f}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <FlatList
                data={filteredGoals}
                renderItem={renderGoal}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>No goals found. Start by adding one!</Text>
                    </View>
                }
            />

            <Modal
                animationType="slide"
                transparent
                statusBarTranslucent
                visible={modalVisible}
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <Pressable style={styles.modalBackdrop} onPress={() => setModalVisible(false)} />
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={styles.modalSheetWrap}
                    >
                        <View style={styles.modalContent}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>New Goal</Text>
                                <TouchableOpacity onPress={() => setModalVisible(false)} hitSlop={12}>
                                    <X size={24} color={theme.text} />
                                </TouchableOpacity>
                            </View>

                            <ScrollView
                                keyboardShouldPersistTaps="handled"
                                showsVerticalScrollIndicator={false}
                                bounces={false}
                            >
                                <Text style={styles.label}>Goal Title</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="e.g., Run a 5k Marathon"
                                    placeholderTextColor="#9CA3AF"
                                    value={newGoalTitle}
                                    onChangeText={setNewGoalTitle}
                                    returnKeyType="done"
                                />

                                <Text style={styles.label}>Category</Text>
                                <View style={styles.categoryContainer}>
                                    {['Career', 'Health', 'Fitness', 'Personal', 'Finance', 'Learning', 'Social', 'Creativity'].map(cat => (
                                        <TouchableOpacity
                                            key={cat}
                                            style={[
                                                styles.categoryChip,
                                                newGoalCategory === cat && styles.categoryChipActive
                                            ]}
                                            onPress={() => setNewGoalCategory(cat)}
                                        >
                                            <Text style={[
                                                styles.categoryText,
                                                newGoalCategory === cat && styles.categoryTextActive
                                            ]}>{cat}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                <TouchableOpacity style={styles.saveButton} onPress={handleAddGoal}>
                                    <Text style={styles.saveButtonText}>Create Goal</Text>
                                </TouchableOpacity>
                            </ScrollView>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const getStyles = (theme: any, isDark: boolean) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.background},
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingBottom: 16},
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: theme.text},
    addButton: {
        backgroundColor: theme.primary,
        padding: 10,
        borderRadius: 20},
    filterContainer: {
        flexDirection: 'row',
        paddingHorizontal: 24,
        marginBottom: 16,
        gap: 12},
    filterChip: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        backgroundColor: theme.card,
        borderWidth: 1,
        borderColor: theme.border},
    filterChipActive: {
        backgroundColor: theme.primary,
        borderColor: theme.primary},
    filterText: {
        color: theme.text,
        fontWeight: '600'},
    filterTextActive: {
        color: '#FFFFFF'},
    listContent: {
        paddingHorizontal: 24,
        paddingBottom: 100},
    goalCard: {
        backgroundColor: theme.card,
        padding: 20,
        borderRadius: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: theme.border},
    goalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12},
    goalCategory: {
        fontSize: 12,
        color: theme.primary,
        fontWeight: '700',
        textTransform: 'uppercase',
        marginBottom: 4},
    goalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: theme.text},
    progressContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12},
    progressBarBg: {
        flex: 1,
        height: 8,
        backgroundColor: theme.surface,
        borderRadius: 4,
        overflow: 'hidden'},
    progressBarFill: {
        height: '100%',
        backgroundColor: theme.primary,
        borderRadius: 4},
    progressText: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.primary},
    emptyContainer: {
        alignItems: 'center',
        marginTop: 40},
    emptyText: {
        color: theme.icon,
        fontSize: 16},
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end'},
    modalBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)'},
    modalSheetWrap: {
        width: '100%',
        maxHeight: '88%'},
    modalContent: {
        backgroundColor: theme.background,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: Platform.OS === 'ios' ? 32 : 24,
        zIndex: 2,
        elevation: 8},
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24},
    modalTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: theme.text},
    label: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.text,
        marginBottom: 8},
    input: {
        backgroundColor: theme.card,
        padding: 16,
        borderRadius: 16,
        fontSize: 16,
        color: theme.text,
        borderWidth: 1,
        borderColor: theme.border,
        marginBottom: 24},
    categoryContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 32},
    categoryChip: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 12,
        backgroundColor: theme.card,
        borderWidth: 1,
        borderColor: theme.border},
    categoryChipActive: {
        backgroundColor: theme.primary,
        borderColor: theme.primary},
    categoryText: {
        color: theme.text,
        fontWeight: '600'},
    categoryTextActive: {
        color: '#fff'},
    saveButton: {
        backgroundColor: theme.primary,
        padding: 18,
        borderRadius: 16,
        alignItems: 'center'},
    saveButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold'}});
