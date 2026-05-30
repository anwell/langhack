"""WebSocket endpoint for real-time voice conversation via Strands BidiAgent.

Provides the /ws WebSocket endpoint that creates a per-connection BidiAgent
backed by Amazon Nova Sonic v2 for bidirectional voice streaming.
"""

from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from strands.experimental.bidi.tools import stop_conversation
from strands.experimental.bidi.types.events import BidiAudioInputEvent

from app.config import get_settings
from app.prompts import build_conversation_prompt
from app.tools import get_vocabulary_hint, signal_session_complete

router = APIRouter()


def create_bidi_agent(system_prompt: str):
    """Create a BidiAgent lazily so REST endpoints can run without Sonic extras."""
    from strands.experimental.bidi import BidiAgent
    from strands.experimental.bidi.models import BidiNovaSonicModel

    settings = get_settings()
    sonic_model = BidiNovaSonicModel(
        region_name=settings.aws_region,
        provider_config={
            "audio": {
                "input_rate": 16000,
                "output_rate": 24000,
                "voice": "tiffany",
            }
        },
    )
    return BidiAgent(
        model=sonic_model,
        tools=[get_vocabulary_hint, signal_session_complete, stop_conversation],
        system_prompt=system_prompt,
    )


def client_message_to_bidi_event(message: dict[str, Any]) -> BidiAudioInputEvent:
    """Convert frontend WebSocket audio messages into Strands Bidi input events."""
    if message.get("type") != "audio" or not isinstance(message.get("data"), str):
        raise ValueError("Expected an audio message with base64 PCM data.")

    return BidiAudioInputEvent(
        audio=message["data"],
        format="pcm",
        sample_rate=16000,
        channels=1,
    )


def translate_text_to_english(text: str, source_language: str) -> str | None:
    """Translate target-language text to English with AWS Translate when available."""
    clean_text = text.strip()
    if not clean_text or source_language.lower().startswith("en"):
        return None

    try:
        import boto3

        settings = get_settings()
        client = boto3.client("translate", region_name=settings.aws_region)
        response = client.translate_text(
            Text=clean_text,
            SourceLanguageCode=source_language,
            TargetLanguageCode="en",
        )
        translated = response.get("TranslatedText")
        return translated if isinstance(translated, str) and translated.strip() else None
    except Exception:
        return None


def bidi_event_to_client_message(event: dict[str, Any]) -> dict[str, Any] | None:
    """Convert Strands Bidi output events into the frontend WebSocket protocol."""
    event_type = event.get("type")

    if event_type == "bidi_audio_stream" and isinstance(event.get("audio"), str):
        return {"type": "audio", "data": event["audio"]}

    if event_type == "bidi_transcript_stream":
        message = {
            "type": "transcript",
            "role": event.get("role", "assistant"),
            "text": event.get("text", ""),
            "is_final": bool(event.get("is_final", False)),
        }
        if isinstance(event.get("english_translation"), str):
            message["english_translation"] = event["english_translation"]
        return message

    if event_type == "bidi_interruption":
        return {"type": "barge-in"}

    if event_type == "bidi_connection_close":
        return {"type": "session_ended", "transcript": []}

    if event_type == "bidi_error":
        return {
            "type": "error",
            "message": "Voice session failed. Check backend AWS Bedrock configuration and logs.",
            "code": event.get("code", "BidiError"),
        }

    # Connection start/restart, response lifecycle, usage, and tool events are not
    # rendered by the current frontend protocol.
    return None


async def receive_client_bidi_input(ws: WebSocket) -> BidiAudioInputEvent:
    """Read and translate one frontend WebSocket message for the BidiAgent."""
    while True:
        message = await ws.receive_json()
        try:
            return client_message_to_bidi_event(message)
        except ValueError:
            # Ignore non-audio control/heartbeat messages instead of tearing down
            # the voice stream.
            continue


async def send_client_bidi_output(
    ws: WebSocket,
    event: dict[str, Any],
    *,
    show_english_translations: bool = False,
    target_language: str = "",
) -> None:
    """Translate one BidiAgent event and send it to the frontend if supported."""
    if (
        show_english_translations
        and event.get("type") == "bidi_transcript_stream"
        and event.get("role", "assistant") == "assistant"
        and bool(event.get("is_final", False))
        and isinstance(event.get("text"), str)
    ):
        translation = translate_text_to_english(event["text"], target_language)
        if translation:
            event = {**event, "english_translation": translation}

    message = bidi_event_to_client_message(event)
    if message is not None:
        await ws.send_json(message)


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """Real-time voice session via BidiAgent.

    Each WebSocket connection gets its own BidiAgent instance.
    The system prompt is constructed from the scenario context and target language
    sent by the client in the initial JSON message.

    Protocol:
        1. Client connects via WebSocket
        2. Client sends initial JSON: {scenario_context, target_language, scenario_id}
        3. Backend translates client audio messages to Strands Bidi events
        4. Backend translates Strands Bidi events back to the frontend protocol
        5. Connection closes on disconnect or stop_conversation tool call
    """
    await ws.accept()
    agent = None

    try:
        init_msg = await ws.receive_json()
        scenario_context = init_msg.get("scenario_context", "")
        target_language = init_msg.get("target_language", "")
        show_english_translations = bool(init_msg.get("show_english_translations", False))

        system_prompt = build_conversation_prompt(scenario_context, target_language)
        agent = create_bidi_agent(system_prompt)

        await agent.run(
            inputs=[lambda: receive_client_bidi_input(ws)],
            outputs=[
                lambda event: send_client_bidi_output(
                    ws,
                    event,
                    show_english_translations=show_english_translations,
                    target_language=target_language,
                )
            ],
        )
    except WebSocketDisconnect:
        pass
    except Exception:
        try:
            await ws.send_json(
                {
                    "type": "error",
                    "message": "Voice session failed. Check backend AWS Bedrock configuration and logs.",
                }
            )
        except Exception:
            pass
    finally:
        if agent is not None:
            await agent.stop()
