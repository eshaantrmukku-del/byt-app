# Voice Call Feature - AI Coach

## Overview
You can now have natural voice conversations with your AI Coach, just like being on a phone call. The feature includes speech recognition, AI responses, and text-to-speech synthesis.

## How to Access

### From AI Coach Screen
1. Open any chat conversation
2. Tap the **Phone icon** (📞) in the top right header
3. The voice call screen will open in full-screen mode

### Features

#### 🎙️ **Voice Input**
- Speak naturally to the AI Coach
- Real-time audio recording
- Automatic speech-to-text conversion
- Visual feedback while listening

#### 🔊 **AI Voice Responses**
- AI responds with natural-sounding speech
- Automatic text-to-speech synthesis
- Continuous conversation flow
- Visual indicators when AI is speaking

#### 🎨 **Beautiful Interface**
- Gradient background (light blue to cyan)
- Animated pulse effect during conversation
- Clean, minimal controls
- Session title display

#### 🎛️ **Controls**
- **Volume** - Adjust speaker volume
- **Mute/Unmute** - Toggle microphone
- **End Call** - Return to text chat

## How It Works

### 1. **Starting a Call**
```
You: [Tap phone icon in AI Coach]
System: Opens voice call screen
System: "Ascend is listening..."
```

### 2. **Having a Conversation**
```
You: [Speak] "I just finished my workout"
System: [Transcribes] → Sends to AI
AI: [Generates response] → Speaks back
System: Updates goals automatically
```

### 3. **Continuous Flow**
- AI speaks its response
- Automatically starts listening again
- Natural back-and-forth conversation
- All messages saved to chat history

## Technical Details

### Audio Capabilities
- **Recording**: High-quality audio capture
- **Permissions**: Automatic microphone permission request
- **Format**: Compatible with speech-to-text services
- **Playback**: Clear, natural-sounding AI voice

### Integration
- ✅ Full goal awareness (same as text chat)
- ✅ Automatic progress tracking
- ✅ Goal creation from voice commands
- ✅ Chat history saved
- ✅ Seamless switch between voice and text

### Visual Feedback
- **Listening State**: Pulsing blue circle
- **Speaking State**: Active dot indicators
- **Transcript Preview**: Shows what you said
- **Status Text**: Clear state communication

## Example Voice Session

**Session Title**: "Career Momentum"

**You**: "Hey, I want to talk about my career goals"

**AI**: "I'd love to help you with that. What's on your mind about your career?"

**You**: "I've been thinking about learning to code"

**AI**: "That's a fantastic goal! I've created a learning goal for you. What programming language interests you most?"

**System**: ✓ Created goal: "Learn Programming" (Learning)

**You**: "I'm thinking Python would be good to start"

**AI**: "Excellent choice! Python is very beginner-friendly and widely used. Would you like some recommendations for getting started?"

## UI Elements

### Header
- **Back Button**: Minimize to chat
- **Session Title**: Current conversation name
- **Info Button**: Session details

### Visualizer
- **Outer Circle**: Animated pulse (280px)
- **Inner Circle**: Static core (200px)
- **Colors**: Blue gradient with glow effect

### Status Indicators
- **Dots**: Three animated dots when AI is speaking
- **Text**: "Ascend is listening..." / "Ascend is speaking..."

### Controls Bar
- **Volume**: Speaker control
- **Mute**: Microphone toggle
- **End**: Red button to exit call

## Privacy & Permissions

### Required Permissions
- **Microphone**: For voice input
- **Audio Playback**: For AI responses

### Data Handling
- Audio is processed in real-time
- Transcripts saved to chat history
- No audio files stored permanently
- Same privacy as text chats

## Tips for Best Experience

1. **Speak Clearly**: Natural pace, clear pronunciation
2. **Quiet Environment**: Minimize background noise
3. **Wait for AI**: Let AI finish speaking before responding
4. **Use Mute**: Mute when not speaking to reduce noise
5. **Check Transcript**: Verify what was heard

## Troubleshooting

### "Microphone not working"
- Check app permissions in Settings
- Ensure microphone isn't used by another app
- Try restarting the app

### "AI not responding"
- Check internet connection
- Verify API key is configured
- Try ending and restarting the call

### "Can't hear AI"
- Check device volume
- Ensure not in silent mode
- Try the volume control button

## Future Enhancements

Potential improvements:
- Real speech-to-text integration (Google/Azure)
- Multiple voice options for AI
- Background noise cancellation
- Call recording and playback
- Multi-language support
- Emotion detection in voice

## Technical Stack

- **Audio Recording**: expo-av
- **Text-to-Speech**: expo-speech
- **Speech-to-Text**: (Placeholder - integrate Google Speech API)
- **Animation**: React Native Animated API
- **UI**: Linear Gradient, Lucide Icons

---

**Note**: The current implementation uses simulated speech-to-text. For production, integrate a real STT service like Google Cloud Speech-to-Text, Azure Speech Services, or AWS Transcribe.
