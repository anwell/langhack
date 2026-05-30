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

  - [x] 1.5 Write property tests for system prompt builder
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

  - [x] 2.4 Write property tests for transcript entry validation
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

  - [x] 4.4 Write property tests for scenario validation and merge
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

  - [x] 5.3 Write property tests for session persistence
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

  - [x] 7.3 Write property tests for feedback validation and persistence
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

- [x] 11. TripAdvisor scraping for travel scenarios
  - [x] 11.1 Add httpx dependency to requirements.txt
    - Add `httpx` to `backend/requirements.txt`
    - Verify installation with `pip install -r requirements.txt`
    - _Requirements: 11.1, 11.3_

  - [x] 11.2 Implement TripAdvisor scraper invocation function
    - Create `invoke_tripadvisor_scraper()` async function in `backend/app/scenario_agent.py`
    - Use `httpx.AsyncClient` with 60s timeout to call Apify REST API
    - POST to `https://api.apify.com/v2/acts/maxcopell~tripadvisor/runs` with actor input (query, maxItemsPerQuery=20, includeAttractions, includeRestaurants, includeHotels, language)
    - Poll or use `waitForFinish` param to get dataset items from `https://api.apify.com/v2/actor-runs/{run_id}/dataset/items`
    - Read Apify token from `get_settings().apify_token`
    - Return list of raw scraped item dicts on success, empty list on failure
    - _Requirements: 11.1, 11.3, 11.12_

  - [x] 11.3 Implement filtering and transformation logic
    - Add `DEFAULT_DESTINATIONS` dict mapping language codes to cities (es→Barcelona, fr→Paris, de→Berlin, it→Rome, pt→Lisbon, ja→Tokyo, ko→Seoul, zh→Beijing)
    - Add `SCENARIO_TEMPLATES` dict with title/description/prompt templates for ATTRACTION, RESTAURANT, and HOTEL types
    - Implement `filter_scraped_items(items)` — exclude closed establishments, entries missing name/address, and entries with invalid type
    - Implement `transform_to_scenarios(items, destination, target_language)` — map filtered items to `Scenario` objects using templates, truncate description to 150 chars, build key_vocabulary from template base + scraped content
    - _Requirements: 11.4, 11.5, 11.6, 11.7, 11.11_

  - [x] 11.4 Update generate endpoint to use TripAdvisor when destination is provided
    - Add `destination: str | None = None` field to `ScenarioGenerationRequest` model
    - Update `generate_scenarios()` endpoint logic: if destination is provided (or default destination exists for target_language), call `invoke_tripadvisor_scraper()`
    - If scraper returns results, filter and transform them into Travel_Scenarios
    - If no destination and no default for language, skip scraping and use existing fallback
    - Set response status to "generated" when TripAdvisor scenarios are produced
    - _Requirements: 11.1, 11.2, 11.9_

  - [x] 11.5 Implement fallback handling for scraper failures
    - If `invoke_tripadvisor_scraper()` raises an exception or returns empty list, fall back to `_fallback_scenarios()`
    - Log warning on scraper failure (do not expose error to client)
    - Ensure response still returns `success: True` with fallback scenarios and status "fallback"
    - _Requirements: 11.8_

  - [x] 11.6 Add destination input to frontend scenario generation UI
    - In `frontend/src/screens/ScenarioListScreen.tsx`, add an optional text input field for destination city above the "Generate new scenarios" button
    - Add placeholder text: "Enter a destination city (optional)"
    - Pass destination value to ApiService when generating scenarios
    - _Requirements: 11.10_

  - [x] 11.7 Update ApiService to pass destination parameter
    - In `frontend/src/services/ApiService.ts`, update the `generateScenarios()` method to accept an optional `destination` parameter
    - Include `destination` in the POST body to `/scenarios/generate` when provided
    - _Requirements: 11.9, 11.10_

  - [x] 11.8 Write property test for TripAdvisor filter logic
    - **Property 12: Scraped item filtering correctness**
    - Test that `filter_scraped_items()` excludes items where `isClosed=True`, items missing `name` or `address`, and items with invalid `type`
    - Test that valid items (open, with name+address, valid type) are always retained
    - **Validates: Requirements 11.11**

  - [x] 11.9 Write property test for scenario transformation
    - **Property 13: Travel scenario schema conformance**
    - Test that `transform_to_scenarios()` produces Scenario objects with non-empty id, title, description (≤150 chars), target_language, key_vocabulary, system_prompt, and source="generated"
    - **Validates: Requirements 11.4, 11.6, 11.7**

  - [x] 11.10 Write property test for default destination selection
    - **Property 14: Default destination mapping completeness**
    - Test that for every language in `DEFAULT_DESTINATIONS`, the mapped city is a non-empty string
    - Test that unknown languages return None (no KeyError)
    - **Validates: Requirements 11.2**

  - [x] 11.11 Write property test for category coverage
    - **Property 15: Category coverage in generated scenarios**
    - Test that when scraped items contain at least one item per category (ATTRACTION, RESTAURANT, HOTEL), the output scenarios cover all three categories
    - **Validates: Requirements 11.5**

- [x] 12. Checkpoint - TripAdvisor integration verified
  - Ensure all tests pass, ask the user if questions arise.
  - At this point you should be able to: enter a destination city, generate travel scenarios from TripAdvisor data, and see real place names in scenario titles.

- [x] 13. Scoring, automatic post-session flow, and enhanced Box upload
  - [x] 13.1 Update Teacher Agent to return session_score and session_pass_fail
    - Add `session_score: int = Field(ge=0, le=100)` to `SessionFeedback` model in `backend/app/teacher_agent.py`
    - Add `session_pass_fail: str` field (literal "pass" or "fail") to `SessionFeedback`
    - Update `build_feedback()` to compute a score (deterministic placeholder: count user turns × 10, capped at 100) and derive pass_fail from score >= 60
    - Add `session_score` and `session_pass_fail` to `FeedbackResponse` model
    - _Requirements: 10.20, 10.21, 10.12_

  - [x] 13.2 Update FeedbackRequest/FeedbackResponse models for score fields
    - Ensure `FeedbackResponse.feedback` includes `session_score` and `session_pass_fail` in the JSON output
    - Update `frontend/src/types/index.ts` `SessionFeedback` interface to add `session_score: number` and `session_pass_fail: "pass" | "fail"`
    - Update `frontend/src/services/ApiService.ts` `requestFeedback()` to parse the new fields from the response
    - _Requirements: 10.12, 10.13, 10.14_

  - [x] 13.3 Update PostSessionScreen to automatically trigger feedback on session end
    - In `frontend/src/screens/PostSessionScreen.tsx`, remove the manual "Request teacher feedback" button
    - Call `getFeedback()` automatically in a `useEffect` on mount (when transcript is non-empty)
    - Display a loading animation (progress indicator with "Analyzing your session..." text) while waiting for Teacher Agent response
    - _Requirements: 10.1, 10.22, 12.14_

  - [x] 13.4 Update PostSessionScreen to automatically trigger Box upload after feedback
    - After feedback is received and persisted, automatically call the Box upload with combined transcript + feedback data
    - Pass the `feedback` object (including score, pass_fail, highlights, corrections, vocabulary, lesson_plan) to the upload request
    - Show loading state during upload, then display "View in Box" link on success
    - If feedback fails, skip Box upload and show retry option for feedback only
    - _Requirements: 8.1, 8.10, 10.1_

  - [x] 13.5 Update Box upload endpoint to accept and format Session_Report
    - In `backend/app/box_upload.py`, add optional `feedback: dict | None = None` field to `TranscriptUploadRequest`
    - Update `_format_transcript()` (rename to `_format_session_report()`) to include: scenario title, session date, session_score, session_pass_fail, full transcript, performance highlights, areas for improvement, corrections, suggested vocabulary, and lesson_plan
    - Format the report as a readable text document with clear section headers
    - _Requirements: 8.1, 8.2_

  - [x] 13.6 Update ApiService to pass feedback in upload request
    - In `frontend/src/services/ApiService.ts`, update `uploadTranscript()` to accept an optional `feedback` parameter
    - Include `feedback` in the POST body to `/transcripts/upload` when provided
    - _Requirements: 8.1, 8.10_

  - [x] 13.7 Write property test for score range validity
    - **Property 16: Session score range validity**
    - Test that `build_feedback()` always returns `session_score` in [0, 100] for any valid transcript input
    - **Validates: Requirements 10.20**

  - [x] 13.8 Write property test for pass/fail threshold consistency
    - **Property 17: Pass/fail threshold consistency**
    - Test that for any `session_score`, `session_pass_fail` is "pass" iff score >= 60, "fail" iff score < 60
    - **Validates: Requirements 10.21**

  - [x] 13.9 Write property test for automatic flow ordering
    - **Property 18: Automatic post-session flow ordering**
    - Test that the post-session pipeline executes Teacher Agent evaluation before Box upload (feedback must be available before upload is called)
    - **Validates: Requirements 10.1, 8.10**

  - [x] 13.10 Write property test for Session Report completeness
    - **Property 19: Session Report completeness**
    - Test that `_format_session_report()` output contains all required fields: transcript entries, session_score, session_pass_fail, performance_highlights, corrections, suggested_vocabulary, and lesson_plan
    - **Validates: Requirements 8.1, 8.2**

- [x] 14. Gamified post-session review UI
  - [x] 14.1 Install animation dependencies
    - Add `react-native-reanimated` and `lottie-react-native` to `frontend/package.json`
    - Update `frontend/babel.config.js` to include `react-native-reanimated/plugin`
    - Verify installation with `npx expo start` (no build errors)
    - _Requirements: 12.3, 12.1, 12.2_

  - [x] 14.2 Implement score count-up animation and color-coded display
    - In `PostSessionScreen`, add animated score display that counts from 0 to `session_score` over 1-2 seconds using `withTiming` from react-native-reanimated
    - Implement `getScoreColor(score)`: green (#16a34a) for >= 80, yellow/amber (#d97706) for 60-79, red (#dc2626) for < 60
    - Display score prominently with the computed color
    - _Requirements: 12.3, 12.4, 12.5, 12.6_

  - [x] 14.3 Implement pass/fail badge with animations
    - Display `session_pass_fail` as a large, visually prominent badge/banner at the top of the feedback section
    - On "pass": trigger confetti/sparkles animation (Lottie or particle effect) lasting 2-3 seconds
    - On "fail": trigger encouraging pulse animation with motivational message ("Keep going! You're improving!")
    - Badge appears before the score display
    - _Requirements: 12.1, 12.2, 12.13_

  - [x] 14.4 Implement color-coded feedback sections
    - Performance highlights section: green background tint (#dcfce7)
    - Corrections section: red background tint (#fee2e2)
    - Suggested vocabulary section: blue background tint (#dbeafe)
    - Areas for improvement: amber background tint (#fef3c7)
    - _Requirements: 12.7, 12.8, 12.9_

  - [x] 14.5 Implement Achievement Service with milestone tracking
    - Create `frontend/src/services/AchievementService.ts`
    - Define `AchievementState` and `AchievementRecord` interfaces
    - Implement `loadAchievementState()` — read from AsyncStorage key `@langhack/achievements`
    - Implement `evaluateAchievements(sessionScore, state)` — check milestone conditions: first-session, streak-3, streak-5, perfect-score, ten-sessions
    - Implement `updateAchievementState(sessionScore)` — increment total_sessions, update streak (reset if gap > 48h), evaluate milestones, persist updated state
    - Streak logic: compare current time to `last_session_date`; if gap > 48 hours, reset `current_streak` to 1; otherwise increment
    - _Requirements: 12.10, 12.11_

  - [x] 14.6 Implement achievement badge display with entrance animation
    - In `PostSessionScreen`, after feedback is displayed, call `updateAchievementState(session_score)`
    - If new badges are earned, display each `AchievementRecord` with icon and label
    - Each badge appears with a scale-up entrance animation using `withSpring({ damping: 8 })`
    - _Requirements: 12.10, 12.12_

  - [x] 14.7 Write property test for score color mapping
    - **Property 20: Score color mapping correctness**
    - Test that for any score 0-100: green if >= 80, yellow/amber if 60-79, red if < 60
    - **Validates: Requirements 12.4, 12.5, 12.6**

  - [x] 14.8 Write property test for achievement milestone detection
    - **Property 21: Achievement milestone detection correctness**
    - Test that `evaluateAchievements()` correctly detects: first-session on first session, streak-3 at 3 consecutive, streak-5 at 5 consecutive, perfect-score at score=100, ten-sessions at total=10
    - Test that each milestone is awarded at most once
    - **Validates: Requirements 12.10, 12.11**

- [x] 15. Checkpoint - Scoring and gamification verified
  - Ensure all tests pass, ask the user if questions arise.
  - At this point you should be able to: end a session → see loading animation → receive score + pass/fail automatically → see confetti/pulse animation → see color-coded feedback → see achievement badges → Box upload happens automatically with full Session_Report.

- [x] 16. Final checkpoint - Full MVP integration
  - Ensure all tests pass, ask the user if questions arise.
  - Full flow: select language → browse scenarios → start voice session → live transcript → end session → automatic feedback with score/pass_fail → gamified review (animations, colors, badges) → automatic Box upload with Session_Report → view in history. Additionally: enter a destination → generate TripAdvisor-based travel scenarios → practice with real place names.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The BidiAgent reference implementation (https://github.com/RDarrylR/serverless-family-recipes-bidirectional-nova-sonic) provides the pattern for task 1.2
- Backend runs on persistent compute (local or EC2/ECS), NOT Lambda, due to WebSocket requirements for Nova Sonic
- The requirements mention Lambda/API Gateway (Req 7) but the design explicitly overrides this for the voice WebSocket — REST endpoints could still be deployed to Lambda separately if desired
- Tasks 13.x UPDATE existing implementations (7.1, 7.2, 8.1, 8.2) to add scoring, automatic flow, and enhanced Box upload
- Tasks 14.x add NEW gamified UI features on top of the updated PostSessionScreen

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
    { "id": 7, "tasks": ["10.1", "11.1"] },
    { "id": 8, "tasks": ["11.2", "11.3"] },
    { "id": 9, "tasks": ["11.4", "11.5", "11.6", "11.7"] },
    { "id": 10, "tasks": ["11.8", "11.9", "11.10", "11.11"] },
    { "id": 11, "tasks": ["13.1", "13.2"] },
    { "id": 12, "tasks": ["13.3", "13.5", "13.6"] },
    { "id": 13, "tasks": ["13.4", "13.7", "13.8", "13.10"] },
    { "id": 14, "tasks": ["13.9", "14.1"] },
    { "id": 15, "tasks": ["14.2", "14.3", "14.4", "14.5"] },
    { "id": 16, "tasks": ["14.6", "14.7", "14.8"] }
  ]
}
```
