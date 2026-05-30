# Implementation Plan: Voice Language Practice

## Overview

This plan delivers the voice language practice MVP in vertical slices, prioritizing the core real-time voice session first, then layering on scenario management, post-session feedback, and cloud backup. Each slice produces something testable end-to-end. The backend is Python/FastAPI with Strands BidiAgent; the frontend is TypeScript with React/Expo.

## Tasks

- [x] 1. Backend foundation and WebSocket voice session
  - [x] 1.1 Set up FastAPI project structure with dependencies
    - Create `backend/` directory with `pyproject.toml` or `requirements.txt`
    - Install dependencies: `fastapi`, `uvicorn`, `strands-agents`, `strands-agents-tools`, `pydantic`, `websockets`
    - Create `backend/app/main.py` with FastAPI app instance and `/health` endpoint
    - Create `backend/app/config.py` for environment variable loading (AWS region, Box credentials, Apify token)
    - _Requirements: 7.1, 7.6_

  - [x] 1.2 Implement BidiAgent WebSocket endpoint for real-time voice
    - **Reference implementation**: https://darryl-ruggles.cloud/bi-directional-voice-controlled-recipe-assistant-with-nova-sonic-2/ and GitHub repo: https://github.com/RDarrylR/serverless-family-recipes-bidirectional-nova-sonic
    - The reference shows: BidiAgent setup with BidiNovaSonicModel, audio config (16kHz input, 24kHz output), FastAPI WebSocket endpoint pattern, @tool decorator usage, AudioWorklet ring buffer on the client, and echo cancellation via Web Audio API
    - Create `backend/app/voice.py` with the WebSocket `/ws` endpoint
    - Instantiate `BidiNovaSonicModel` with `region_name="us-east-1"`, input_rate 16000, output_rate 24000, voice "tiffany"
    - Accept WebSocket connection, read initial JSON message for `scenario_context`, `target_language`, `scenario_id`
    - Build system prompt via `build_conversation_prompt()` including scenario context and target language
    - Create `BidiAgent` with model, tools (`get_vocabulary_hint`, `signal_session_complete`, `stop_conversation`), and system prompt
    - Call `await agent.run(inputs=[ws.receive_json], outputs=[ws.send_json])`
    - Handle `WebSocketDisconnect` and call `await agent.stop()` in finally block
    - _Requirements: 2.2, 2.3, 3.1, 3.3, 3.7_

  - [x] 1.3 Implement conversation tools with @tool decorator
    - Create `backend/app/tools.py`
    - Implement `get_vocabulary_hint(word_or_phrase: str, target_language: str) -> str` using `@tool`
    - Implement `signal_session_complete(reason: str) -> str` using `@tool`
    - Import `stop_conversation` from `strands.experimental.bidi.tools`
    - _Requirements: 3.4, 6.3_

  - [x] 1.4 Implement system prompt builder
    - Create `backend/app/prompts.py` with `build_conversation_prompt(scenario_context, target_language) -> str`
    - Include scenario context, target language, conversation rules, implicit correction behavior, and voice style directives
    - _Requirements: 2.3, 6.3_

  - [ ]* 1.5 Write property tests for system prompt builder
    - **Property 3: System prompt includes scenario and language**
    - **Validates: Requirements 2.3, 6.3**

- [x] 2. Frontend foundation and voice session UI
  - [x] 2.1 Set up React/Expo project structure
    - Initialize Expo project in `frontend/` directory
    - Install dependencies: `expo-av`, `react-native-async-storage`, WebSocket support
    - Create directory structure: `src/screens/`, `src/services/`, `src/components/`, `src/types/`
    - Define TypeScript interfaces in `src/types/index.ts`: `Scenario`, `TranscriptEntry`, `SessionRecord`, `SessionFeedback`, `Correction`, `SuggestedPhrase`, `SuggestedScenario`, `LessonPlanItem`
    - _Requirements: 1.1, 4.2_

  - [x] 2.2 Implement WebSocket service and audio capture/playback
    - Create `src/services/WebSocketService.ts` — manages connection to backend `/ws`
    - Create `src/services/AudioCaptureService.ts` — 16kHz AudioContext, `getUserMedia({ echoCancellation: true })`, ScriptProcessorNode, Float32→PCM16→Base64 encoding
    - Create `src/services/AudioPlaybackService.ts` — 24kHz AudioContext, AudioWorkletNode with ring buffer
    - Create `src/services/audio-player-processor.js` — AudioWorklet processor with 60s ring buffer (24000 * 60 samples), barge-in support (readPos = writePos on clear)
    - Handle WebSocket messages: `audio` (enqueue to ring buffer), `transcript` (emit event), `barge-in` (clear buffer), `session_ended` (close)
    - _Requirements: 3.1, 3.3, 3.7, 5.1, 5.2, 5.5_

  - [x] 2.3 Implement Session screen with voice conversation UI
    - Create `src/screens/SessionScreen.tsx`
    - On mount: send init message `{scenario_context, target_language, scenario_id}` over WebSocket
    - Start audio capture and playback automatically (hands-free)
    - Display live transcript entries as they arrive (labeled user/assistant)
    - Show visual indicator while session is active
    - Stop button to end session and close WebSocket
    - Handle connection errors with retry (up to 3 attempts)
    - Keep screen awake during session
    - _Requirements: 2.2, 2.4, 2.6, 3.1, 3.2, 3.4, 3.5, 3.6, 4.1, 4.2, 5.1, 5.3_

  - [ ]* 2.4 Write property tests for transcript entry validation
    - **Property 4: Transcript entries have valid speaker labels**
    - **Validates: Requirements 4.2**

- [x] 3. Checkpoint - Voice session end-to-end
  - Ensure all tests pass, ask the user if questions arise.
  - At this point you should be able to: start the FastAPI server, open the frontend, connect via WebSocket, and have a real-time voice conversation with Nova Sonic through the BidiAgent.

- [x] 4. Scenario management (list, cache, generate)
  - [x] 4.1 Implement backend scenario endpoints
    - Create `backend/app/scenarios.py`
    - Implement `GET /scenarios` — returns static list of preloaded scenarios as JSON
    - Create `backend/app/data/scenarios.json` with 3-5 preloaded scenarios per supported language
    - Implement Pydantic models: `Scenario` (id, title, description, target_language, key_vocabulary, system_prompt, source, created_at)
    - _Requirements: 1.3, 9.6_

  - [x] 4.2 Implement Scenario Agent with Apify tool
    - Create `backend/app/scenario_agent.py`
    - Implement `POST /scenarios/generate` endpoint accepting `target_language` and `proficiency_context`
    - Create Strands Agent (non-bidi) with Apify scraping tool
    - Agent scrapes phrasebook/travel guide content, transforms into structured Scenario objects
    - Return generated scenarios in same format as static list
    - Handle failures gracefully: return empty list with `success: false`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.11_

  - [x] 4.3 Implement Scenario List screen with caching and merge logic
    - Create `src/screens/ScenarioListScreen.tsx`
    - Display scenarios with title and description (max 150 chars)
    - On mount: load cached scenarios from AsyncStorage, fetch from backend, merge (deduplicate by ID)
    - Tap scenario → navigate to Session screen with scenario context
    - Ship preloaded scenarios bundled in app as fallback
    - If backend unreachable, show cached/preloaded list silently (no error shown)
    - If cache empty and backend unreachable, show "no scenarios available" with retry
    - Add "Generate new scenarios" button that calls `/scenarios/generate`
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 1.7, 9.9, 9.10, 9.12_

  - [ ]* 4.4 Write property tests for scenario validation and merge
    - **Property 1: Scenario schema conformance**
    - **Property 2: Scenario description length constraint**
    - **Property 8: Scenario merge deduplication**
    - **Validates: Requirements 1.1, 1.3, 9.4, 9.6, 9.10**

- [x] 5. Transcript persistence and history
  - [x] 5.1 Implement local storage service for transcripts
    - Create `src/services/StorageService.ts`
    - Implement `saveSession(record: SessionRecord): Promise<void>` — persist to AsyncStorage
    - Implement `getSessions(): Promise<SessionRecord[]>` — retrieve all, sorted reverse chronological
    - Implement `getSession(id: string): Promise<SessionRecord | null>`
    - Implement `updateSession(id: string, updates: Partial<SessionRecord>): Promise<void>` — for adding box_file_url or feedback later
    - On session end in SessionScreen: persist transcript locally immediately
    - _Requirements: 4.3, 8.9_

  - [x] 5.2 Implement Transcript History screen
    - Create `src/screens/HistoryScreen.tsx`
    - List past sessions in reverse chronological order (date + scenario title)
    - Tap entry → view full transcript
    - Show "View in Box" link if `box_file_url` exists (opens in browser)
    - Show "View Feedback" option if `feedback` exists
    - _Requirements: 4.4, 8.5, 8.6_

  - [ ]* 5.3 Write property tests for session persistence
    - **Property 5: Session record persistence round-trip**
    - **Property 6: Transcript history reverse chronological ordering**
    - **Property 7: Local transcript persistence invariant**
    - **Property 11: Conditional data-driven display**
    - **Validates: Requirements 4.3, 4.4, 8.4, 8.5, 8.9, 10.14**

- [x] 6. Checkpoint - Scenario selection and transcript history
  - Ensure all tests pass, ask the user if questions arise.
  - At this point you should be able to: browse scenarios, start a voice session, see live transcript, end session, and view transcript in history.

- [x] 7. Teacher Agent feedback and post-session review
  - [x] 7.1 Implement Teacher Agent backend endpoint
    - Create `backend/app/teacher_agent.py`
    - Implement `POST /feedback` endpoint accepting transcript, target_language, and available_scenarios
    - Create Strands Agent (non-bidi) or direct Bedrock Converse call
    - System prompt instructs evaluation of grammar, vocabulary, pronunciation patterns, conversational flow
    - Return structured `SessionFeedback` JSON with all 6 sections: performance_highlights, areas_for_improvement, corrections, suggested_vocabulary, suggested_scenarios (1-3), lesson_plan (1-5 items, each with focus_area and up to 5 practice_phrases)
    - Handle failures: return error status, app shows retry option
    - _Requirements: 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11, 10.12, 10.17_

  - [x] 7.2 Implement Post-Session Review screen
    - Create `src/screens/PostSessionScreen.tsx`
    - Display after session ends with option to request feedback
    - On feedback received: display organized by 6 sections (highlights, improvements, corrections, vocabulary, suggested scenarios, lesson plan)
    - Persist feedback locally alongside transcript
    - Tap suggested scenario (existing) → navigate to Session screen
    - Handle feedback unavailable: show message + retry option
    - _Requirements: 10.1, 10.2, 10.13, 10.14, 10.15, 10.16, 10.18, 10.19_

  - [ ]* 7.3 Write property tests for feedback validation and persistence
    - **Property 9: Feedback response structure validity**
    - **Property 10: Feedback persistence round-trip**
    - **Validates: Requirements 10.4, 10.6, 10.9, 10.11, 10.13**

- [x] 8. Box.com transcript upload
  - [x] 8.1 Implement Box upload backend endpoint
    - Create `backend/app/box_upload.py`
    - Implement `POST /transcripts/upload` accepting transcript, session_date, scenario_title
    - Use Box SDK or REST API to create file in designated folder
    - File content: full transcript text with session date and scenario title header
    - Return `box_file_url` on success, error response on failure
    - Read Box credentials from environment variables
    - _Requirements: 8.2, 8.3, 7.6_

  - [x] 8.2 Integrate Box upload into session end flow
    - In `PostSessionScreen`: after session ends, automatically attempt Box upload
    - On success: store `box_file_url` in local session record, show "View in Box" link
    - On failure: show "cloud backup failed" message, add retry button in history screen
    - Transcript always persisted locally regardless of upload outcome
    - _Requirements: 8.1, 8.4, 8.7, 8.8, 8.9_

- [x] 9. Language configuration and settings
  - [x] 9.1 Implement Settings screen with language selection
    - Create `src/screens/SettingsScreen.tsx`
    - Target language picker (at least 2 languages)
    - Source language picker (defaults to English)
    - Persist selections to AsyncStorage
    - Selections persist across app restarts
    - Block session start if no target language selected (prompt user)
    - _Requirements: 6.1, 6.2, 6.4, 6.5, 6.6, 6.7_

  - [x] 9.2 Wire language settings into session and feedback flows
    - Session init message includes selected target_language
    - Feedback request includes target_language and source_language
    - Scenario generation includes target_language
    - _Requirements: 6.3, 6.7, 10.2_

- [x] 10. Navigation and app shell
  - [x] 10.1 Implement app navigation and entry point
    - Set up React Navigation with tab/stack navigator
    - Tabs: Scenarios, History, Settings
    - Stack: ScenarioList → Session → PostSession
    - Wire all screens together
    - _Requirements: 1.2, 4.4_

- [ ] 11. Final checkpoint - Full MVP integration
  - Ensure all tests pass, ask the user if questions arise.
  - Full flow: select language → browse scenarios → start voice session → live transcript → end session → view feedback → upload to Box → view in history.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The BidiAgent reference implementation (https://github.com/RDarrylR/serverless-family-recipes-bidirectional-nova-sonic) provides the pattern for task 1.2
- Backend runs on persistent compute (local or EC2/ECS), NOT Lambda, due to WebSocket requirements for Nova Sonic
- The requirements mention Lambda/API Gateway (Req 7) but the design explicitly overrides this for the voice WebSocket — REST endpoints could still be deployed to Lambda separately if desired

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "2.2"] },
    { "id": 2, "tasks": ["1.5", "2.3", "2.4"] },
    { "id": 3, "tasks": ["4.1", "5.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "5.2", "5.3"] },
    { "id": 5, "tasks": ["4.4", "7.1", "8.1", "9.1"] },
    { "id": 6, "tasks": ["7.2", "7.3", "8.2", "9.2"] },
    { "id": 7, "tasks": ["10.1"] }
  ]
}
```
