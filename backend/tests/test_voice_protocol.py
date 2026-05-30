"""Unit tests for the browser-to-Strands WebSocket protocol adapter."""

import pytest

from app.voice import bidi_event_to_client_message, client_message_to_bidi_event


def test_client_audio_message_maps_to_bidi_audio_input():
    event = client_message_to_bidi_event({"type": "audio", "data": "AAAA"})

    assert event["type"] == "bidi_audio_input"
    assert event["audio"] == "AAAA"
    assert event["format"] == "pcm"
    assert event["sample_rate"] == 16000
    assert event["channels"] == 1


@pytest.mark.parametrize(
    "message",
    [
        {"type": "audio"},
        {"type": "audio", "data": 123},
        {"type": "heartbeat"},
        {},
    ],
)
def test_client_non_audio_messages_are_rejected(message):
    with pytest.raises(ValueError):
        client_message_to_bidi_event(message)


def test_bidi_audio_stream_maps_to_frontend_audio_message():
    message = bidi_event_to_client_message(
        {
            "type": "bidi_audio_stream",
            "audio": "BBBB",
            "format": "pcm",
            "sample_rate": 24000,
            "channels": 1,
        }
    )

    assert message == {"type": "audio", "data": "BBBB"}


def test_bidi_transcript_stream_maps_to_frontend_transcript_message():
    message = bidi_event_to_client_message(
        {
            "type": "bidi_transcript_stream",
            "role": "assistant",
            "text": "¡Hola!",
            "is_final": True,
        }
    )

    assert message == {
        "type": "transcript",
        "role": "assistant",
        "text": "¡Hola!",
        "is_final": True,
    }


def test_bidi_interruption_maps_to_barge_in_message():
    assert bidi_event_to_client_message({"type": "bidi_interruption", "reason": "user_speech"}) == {
        "type": "barge-in"
    }


def test_bidi_error_maps_to_frontend_error_without_leaking_details():
    message = bidi_event_to_client_message(
        {"type": "bidi_error", "message": "low-level provider details", "code": "ProviderError"}
    )

    assert message == {
        "type": "error",
        "message": "Voice session failed. Check backend AWS Bedrock configuration and logs.",
        "code": "ProviderError",
    }


def test_unrendered_bidi_events_are_ignored():
    assert bidi_event_to_client_message({"type": "bidi_usage", "totalTokens": 1}) is None


def test_websocket_startup_failure_returns_error_message(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app import voice

    def fail_create_bidi_agent(_system_prompt: str):
        raise RuntimeError("provider startup failed")

    monkeypatch.setattr(voice, "create_bidi_agent", fail_create_bidi_agent)

    app = FastAPI()
    app.include_router(voice.router)

    with TestClient(app).websocket_connect("/ws") as websocket:
        websocket.send_json(
            {
                "scenario_context": "Order at a café",
                "target_language": "es",
                "scenario_id": "cafe",
            }
        )

        assert websocket.receive_json() == {
            "type": "error",
            "message": "Voice session failed. Check backend AWS Bedrock configuration and logs.",
        }
