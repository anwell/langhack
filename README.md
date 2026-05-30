# Voice Language Practice

Voice Language Practice is a mobile app and backend for real-time spoken language practice. The backend is a FastAPI service that connects voice sessions to Amazon Nova Sonic through Strands BidiAgent, and the frontend is a React Native/Expo app for scenarios, live voice sessions, transcript history, feedback, and transcript backup.

## Repository Layout

```text
backend/   FastAPI service, voice WebSocket, scenario APIs, feedback, Box upload
frontend/  Expo React Native app
.kiro/     Product requirements, design notes, and implementation task list
```

## Product Context

The `.kiro/specs/voice-language-practice/` folder is the source of product and architecture context:

- `requirements.md` describes the user stories and acceptance criteria.
- `design.md` describes the current technical architecture.
- `tasks.md` tracks implementation progress.

When requirements and design disagree, follow the newer implementation direction in `design.md`: the MVP uses Amazon Bedrock Nova Sonic through Strands `BidiAgent`, not Gemini Live, and it runs the FastAPI backend on persistent compute locally or on EC2/ECS, not Lambda. Nova Sonic voice sessions require long-lived WebSocket connections, which do not fit the API Gateway/Lambda timeout model.

The intended MVP flow is:

1. Select source and target languages.
2. Browse cached, bundled, or backend-provided scenarios.
3. Start a hands-free voice role-play session.
4. Stream microphone audio to the backend over WebSocket.
5. Receive AI audio, transcript events, and barge-in events from Nova Sonic.
6. Persist the transcript locally at session end.
7. Optionally upload the transcript to Box.
8. Request Teacher Agent feedback and save it with the session record.

## Prerequisites

- Python 3.12+
- uv
- Node.js 18+
- npm
- Expo-compatible simulator, device, or web browser
- AWS credentials with access to Amazon Bedrock Nova Sonic for real voice sessions
- Optional service credentials for Box transcript upload and Apify scenario generation

## Secrets and Environment

The backend reads configuration from `backend/.env` via `python-dotenv`.

Create your local file from the example:

```bash
cp backend/.env.example backend/.env
```

Then fill in the values in `backend/.env`.

Important notes:

- `backend/.env` is ignored by git and must stay local.
- Do not commit real AWS, Box, or Apify credentials.
- AWS credentials are resolved through the normal AWS SDK chain, so you can use either `AWS_PROFILE` or explicit access keys in `backend/.env`.
- `AWS_REGION` must match the region where Nova Sonic is available for your account.

## Backend Development

From the repository root:

```bash
cd backend
uv venv --python 3.12
uv pip install -r requirements.txt
```

Start the API server:

```bash
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Useful backend checks:

```bash
uv run python -m compileall app
uv run python - <<'PY'
from app.main import app
print(app.title)
PY
```

The main local endpoints are:

- `GET http://localhost:8000/health`
- `GET http://localhost:8000/scenarios`
- `POST http://localhost:8000/scenarios/generate`
- `POST http://localhost:8000/feedback`
- `POST http://localhost:8000/transcripts/upload`
- `WS ws://localhost:8000/ws`

## Frontend Development

Install dependencies:

```bash
cd frontend
npm install
```

Start Expo:

```bash
npm start
```

Common Expo targets:

```bash
npm run ios
npm run android
npm run web
```

Useful frontend checks:

```bash
npx tsc --noEmit
npm test -- --runInBand
npm run lint
```

The frontend currently talks to the backend at `http://localhost:8000` and `ws://localhost:8000/ws` from:

- `frontend/src/services/ApiService.ts`
- `frontend/src/services/WebSocketService.ts`

If you run the app on a physical mobile device, `localhost` points at the device itself. Use your machine's LAN IP address in those service files, or route traffic through an emulator setup that can reach the host machine.

## Full Local Flow

1. Start the backend from `backend/`.
2. Start Expo from `frontend/`.
3. Open the app in a simulator, browser, or device.
4. Pick source and target languages in Settings.
5. Browse or generate scenarios.
6. Start a voice session.
7. End the session to review the transcript, request feedback, and attempt Box backup.
8. Check History for saved sessions and feedback.

Real voice sessions require valid AWS/Bedrock configuration. Scenario generation requires `APIFY_TOKEN`. Box backup requires Box credentials and `BOX_FOLDER_ID`. The app should still support local scenario browsing and transcript persistence when optional external services are unavailable.

## Architecture Notes

- The Conversation Agent is a per-connection Strands `BidiAgent` using Nova Sonic for real-time speech.
- The Teacher Agent is a request/response REST workflow that returns structured post-session feedback.
- The Scenario Agent is a request/response REST workflow that can use Apify-backed content to create fresh practice scenarios.
- The frontend stores scenario cache, settings, transcripts, Box URLs, and feedback locally.
- The backend should remain stateless: no server-side database, session history, or durable user state.
- Voice capture uses 16kHz PCM16 audio; playback expects 24kHz PCM16 audio through an AudioWorklet ring buffer.
- The client should tolerate unknown WebSocket message types because final event shapes are mediated by Strands.

## Testing Strategy

The `.kiro` design defines property-based tests for the highest-risk behavior. As implementation continues, prefer tests that cover these invariants:

- Scenario schema conformance and 150-character description display limit.
- System prompts always include the scenario context and target language.
- Transcript roles are only `user` or `assistant`.
- Session records and feedback round-trip through local storage.
- History is reverse chronological.
- Transcript persistence is independent of Box upload success.
- Scenario merge logic deduplicates by scenario ID.
- Feedback includes all required sections and valid cardinalities.
- History conditionally displays Box and feedback actions only when data exists.

## Project Notes

- Backend app entry point: `backend/app/main.py`
- Voice WebSocket implementation: `backend/app/voice.py`
- Scenario endpoints: `backend/app/scenarios.py` and `backend/app/scenario_agent.py`
- Teacher feedback endpoint: `backend/app/teacher_agent.py`
- Transcript upload endpoint: `backend/app/box_upload.py`
- Frontend entry point: `frontend/App.tsx`
- Frontend screens: `frontend/src/screens/`
- Frontend services: `frontend/src/services/`
- Product/task context: `.kiro/specs/voice-language-practice/`

## Development Guidelines

- Keep secrets in local `.env` files only.
- Prefer small vertical changes that can be tested through the app flow.
- Run TypeScript and Jest checks before handing off frontend changes.
- Run Python import/compile checks before handing off backend changes.
- Update `.kiro/specs/voice-language-practice/tasks.md` when completing tracked implementation tasks.
