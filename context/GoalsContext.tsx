import React, { createContext, useContext, useState, useEffect } from 'react';

// Define the Goal type based on your mock data
export interface Goal {
    id: string;
    title: string;
    category: string;
    status: string;
    progress: number;
    image: string;
    type: 'active' | 'stuck' | 'completed';
}

interface GoalsContextType {
    goals: Goal[];
    addGoal: (goal: Goal) => void;
    updateGoalProgress: (id: string, progress: number, status?: string) => void;
    deleteGoal: (id: string) => void;
}

const GoalsContext = createContext<GoalsContextType | undefined>(undefined);

// Mock Data
const INITIAL_GOALS: Goal[] = [
    {
        id: '1',
        title: 'Meditate Daily',
        category: 'Health',
        status: 'High Momentum',
        progress: 65,
        image: 'https://images.unsplash.com/photo-1544367563-12123d8965cd?q=80&w=2670&auto=format&fit=crop',
        type: 'active'
    },
    {
        id: '2',
        title: 'Launch Portfolio',
        category: 'Career',
        status: 'Needs Clarity',
        progress: 20,
        image: 'https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?q=80&w=2670&auto=format&fit=crop',
        type: 'stuck'
    },
    {
        id: '3',
        title: 'Consistent Gym Routine',
        category: 'Fitness',
        status: 'Steady Pace',
        progress: 45,
        image: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=2670&auto=format&fit=crop',
        type: 'active'
    }
];

export function GoalsProvider({ children }: { children: React.ReactNode }) {
    const [goals, setGoals] = useState<Goal[]>(INITIAL_GOALS);

    const addGoal = (goal: Goal) => {
        setGoals(prev => [goal, ...prev]);
    };

    const updateGoalProgress = (id: string, progress: number, status?: string) => {
        setGoals(prev => prev.map(goal =>
            goal.id === id ? { ...goal, progress, status: status || goal.status } : goal
        ));
    };

    const deleteGoal = (id: string) => {
        setGoals(prev => prev.filter(goal => goal.id !== id));
    };

    return (
        <GoalsContext.Provider value={{ goals, addGoal, updateGoalProgress, deleteGoal }}>
            {children}
        </GoalsContext.Provider>
    );
}

export function useGoals() {
    const context = useContext(GoalsContext);
    if (context === undefined) {
        throw new Error('useGoals must be used within a GoalsProvider');
    }
    return context;
}
