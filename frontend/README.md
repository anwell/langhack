# Voice Language Practice - Frontend

React/Expo mobile app for real-time voice language practice.

## Setup

```bash
bun install
bun start
```

## Project Structure

```
src/
├── components/   # Reusable UI components
├── screens/      # App screens (ScenarioList, Session, PostSession, History, Settings)
├── services/     # WebSocket, Audio, Storage, API services
└── types/        # TypeScript interfaces and type definitions
```

## Key Dependencies

- **expo-av** — Audio recording and playback
- **@react-native-async-storage/async-storage** — Local data persistence
- **@react-navigation** — Screen navigation (tabs + stack)
- **fast-check** — Property-based testing

## Audio Architecture

- Capture: 16kHz AudioContext with echo cancellation
- Playback: 24kHz AudioContext with AudioWorklet ring buffer (60s)
- Transport: WebSocket with base64-encoded PCM16 audio chunks
