# Implementation Plan: Functional Ascend App

## Overview
This plan details the changes made to transform the Ascend prototype into a functional application with persistent state management and working user flows.

## key Changes

### 1. State Management (Zustand)
- **Store**: `store/useStore.ts` was updated to include `image` and `type` fields in the `Goal` definition to support the AI Coach features.
- **Goal Export**: Exported `Goal` type from the store for use in other components.

### 2. Authentication & Navigation
- **Root Layout**: Updated `app/_layout.tsx` to include `index` (landing), `auth/login`, and `auth/signup` screens in the stack.
- **Landing Screen**: Created `app/index.tsx` to handle initial auth check and splash animation.
- **Login/Signup**: Ensured these screens use `useStore` to log the user in and redirect to `/(tabs)`.

### 3. Dashboard (Home Screen)
- **Data Integration**: Updated `app/(tabs)/index.tsx` to read `user`, `activeGoals`, `streak`, and `progress` directly from the Zustand store.
- **Navigation**: Fixed "Quick Actions" buttons to route to correct screens (`/check-in`, `/goals`, `/ai-coach`).
- **Dynamic UI**: The "Active Goals" section now displays real data from the store.

### 4. Goals Management
- **Screen**: Rewrote `app/(tabs)/goals.tsx` to use `useStore` for fetching and managing goals.
- **Add Goal**: Implemented a functional "Add Goal" modal that persists new goals to the store.
- **Filtering**: Added working filters for "All", "Active", and "Completed".

### 5. Daily Check-In
- **Submission**: Connected the "Submit" button in `app/check-in.tsx` to `addCheckIn` action in the store.
- **Persistence**: Check-in data (mood, energy, notes) is now saved locally.

### 6. AI Coach Integration
- **Store Migration**: Refactored `app/ai-coach.tsx` to use `useStore` instead of the deprecated `GoalsContext`.
- **Goal Awareness**: The AI Coach now reads real user goals from the store to provide context-aware responses.
- **Service Update**: Updated `services/ai.ts` to use the correct `Goal` type from the store.

## Verification Steps
1. **Launch App**: Observe the splash screen and redirect to Login (if not logged in).
2. **Login**: Enter name/email and tap Login. Verify redirect to Dashboard.
3. **Dashboard**: Check that "Good morning, [Name]" appears.
4. **Create Goal**: Go to "Set Goal" -> "+" -> Create a goal.
5. **Verify Goal**: See the new goal on the Dashboard and Goals tab.
6. **Check-In**: Go to "Reflect Now", select mood, submit. Verify "Streak" increases on Dashboard.
7. **AI Coach**: Chat with the coach. It should acknowledge your goals if you mention them.

## Next Steps
- **Backend**: Replace `AsyncStorage` persistence with a real backend (Firebase/Supabase).
- **Voice**: Implement real voice processing in `voice-call`.
- **Journalling**: Flesh out the `journal` screen.
