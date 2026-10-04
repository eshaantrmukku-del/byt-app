# AI Goal Awareness System

## Overview
The AI Coach in Ascend is now fully aware of your goals and can intelligently update their progress based on your conversations.

## How It Works

### 1. **Goal Context Injection**
Every time you send a message to the AI Coach, it receives a complete snapshot of your current goals:
- Goal titles
- Categories (Health, Career, Fitness, etc.)
- Current progress percentages
- Status indicators

This allows the AI to:
- Reference your specific goals in responses
- Provide personalized coaching based on your actual situation
- Celebrate progress and offer relevant guidance

### 2. **Intelligent Progress Detection**
The system analyzes your messages for keywords and phrases that indicate progress on your goals:

**Meditation/Mindfulness** (+8% progress)
- Keywords: meditate, meditation, mindful, mindfulness, breathing exercise, yoga
- Matches goals containing: "meditat", "mindful", or category "Health"

**Gym/Fitness** (+10% progress)
- Keywords: gym, workout, exercise, lift, run, cardio, training
- Matches goals containing: "gym", "fitness", "workout", or category "Fitness"

**Career/Portfolio** (+5% progress)
- Keywords: portfolio, project, work, code, develop, design, launch, ship
- Matches goals containing: "portfolio", "career", "project", or category "Career"

**Reading/Learning** (+7% progress)
- Keywords: read, book, learn, study, course, article
- Matches goals containing: "read", "learn", or category "Learning"

**Networking** (+6% progress)
- Keywords: network, connect, meeting, coffee chat, reach out
- Matches goals containing: "network", "connect", or category "Social"

### 3. **Automatic Updates**
When you mention completing activities related to your goals, the system:
1. Detects the relevant goal(s)
2. Calculates appropriate progress increase
3. Updates the goal automatically
4. Logs the change with reasoning

### 4. **AI Coaching Integration**
The AI Coach uses your goals to:
- Provide context-aware responses
- Ask relevant follow-up questions
- Celebrate your wins
- Help you overcome obstacles
- Suggest next steps aligned with your goals

## Example Conversations

**You:** "I just finished a 20-minute meditation session"
**AI:** "That's wonderful! Consistency with meditation is key to building the habit. How did you feel during the session?"
**System:** ✓ Meditate Daily: 65% → 73% (Completed meditation session)

**You:** "I went to the gym this morning and did a full workout"
**AI:** "Excellent work showing up for your fitness goals! What did you focus on today?"
**System:** ✓ Consistent Gym Routine: 45% → 55% (Completed workout session)

**You:** "I made some progress on my portfolio project today"
**AI:** "Great momentum! What aspect of your portfolio did you work on?"
**System:** ✓ Launch Portfolio: 20% → 25% (Made progress on career goal)

## Benefits

1. **No Manual Tracking**: Just chat naturally about your day
2. **Contextual Coaching**: AI knows exactly where you are in your journey
3. **Motivation**: See real-time progress as you share your wins
4. **Accountability**: The AI can reference your goals and progress over time
5. **Personalized Guidance**: Coaching tailored to your specific goals and challenges

## Privacy & Data
- All goal data stays local on your device
- Goals are sent to the AI only during active conversations
- No goal data is stored by the AI service
- You maintain full control over your goals and progress
