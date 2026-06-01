"""Unit tests for the browser-to-Strands WebSocket protocol adapter."""

import pytest

from app.voice import (
    NOVA_SONIC_PROVIDER_CONFIG,
    VOICE_SESSION_GENERIC_ERROR_MESSAGE,
    VOICE_SESSION_TEMPORARY_ERROR_MESSAGE,
    bidi_event_to_client_message,
    build_session_opening_instruction,
    create_bidi_agent,
    client_message_to_bidi_event,
    create_session_input_source,
    send_client_bidi_output,
    voice_session_error_message,
)


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


def test_session_opening_instruction_tells_agent_to_speak_first():
    instruction = build_session_opening_instruction("Order at a café", "es")

    assert "Begin this es role-play now" in instruction
    assert "Speak first as the scenario character" in instruction
    assert "Order at a café" in instruction


def test_create_bidi_agent_uses_stable_nova_sonic_configuration(monkeypatch):
    captured_model_kwargs = {}
    captured_agent_kwargs = {}

    class FakeModel:
        def __init__(self, **kwargs):
            captured_model_kwargs.update(kwargs)

    class FakeAgent:
        def __init__(self, **kwargs):
            captured_agent_kwargs.update(kwargs)

    monkeypatch.setattr("strands.experimental.bidi.models.BidiNovaSonicModel", FakeModel)
    monkeypatch.setattr("strands.experimental.bidi.BidiAgent", FakeAgent)
    monkeypatch.setattr("app.voice.get_settings", lambda: type("Settings", (), {"aws_region": "eu-north-1"})())

    agent = create_bidi_agent("Speak Spanish.")

    assert isinstance(agent, FakeAgent)
    assert captured_model_kwargs == {
        "client_config": {"region": "eu-north-1"},
        "provider_config": NOVA_SONIC_PROVIDER_CONFIG,
    }
    assert captured_agent_kwargs["model"].__class__ is FakeModel
    assert captured_agent_kwargs["system_prompt"] == "Speak Spanish."
    assert NOVA_SONIC_PROVIDER_CONFIG["inference"] == {
        "max_tokens": 2048,
        "temperature": 0,
    }
    assert NOVA_SONIC_PROVIDER_CONFIG["turn_detection"] == {
        "endpointingSensitivity": "MEDIUM",
    }


@pytest.mark.asyncio
async def test_session_input_source_sends_opening_then_client_audio():
    class FakeWebSocket:
        def __init__(self):
            self.messages = [{"type": "audio", "data": "AAAA"}]

        async def receive_json(self):
            return self.messages.pop(0)

    input_source = create_session_input_source(FakeWebSocket(), "Order at a café", "es")

    first_event = await input_source()
    second_event = await input_source()

    assert first_event["type"] == "bidi_text_input"
    assert first_event["role"] == "user"
    assert "Speak first as the scenario character" in first_event["text"]
    assert second_event["type"] == "bidi_audio_input"
    assert second_event["audio"] == "AAAA"


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


def test_bidi_transcript_stream_maps_english_translation_when_present():
    message = bidi_event_to_client_message(
        {
            "type": "bidi_transcript_stream",
            "role": "assistant",
            "text": "¡Hola!",
            "english_translation": "Hello!",
            "is_final": True,
        }
    )

    assert message == {
        "type": "transcript",
        "role": "assistant",
        "text": "¡Hola!",
        "english_translation": "Hello!",
        "is_final": True,
    }


@pytest.mark.asyncio
async def test_send_client_bidi_output_adds_final_assistant_translation(monkeypatch):
    sent_messages = []

    class FakeWebSocket:
        async def send_json(self, message):
            sent_messages.append(message)

    monkeypatch.setattr("app.voice.translate_text_to_english", lambda text, source: "Hello!")

    await send_client_bidi_output(
        FakeWebSocket(),
        {
            "type": "bidi_transcript_stream",
            "role": "assistant",
            "text": "¡Hola!",
            "is_final": True,
        },
        show_english_translations=True,
        target_language="es",
    )

    assert sent_messages == [
        {
            "type": "transcript",
            "role": "assistant",
            "text": "¡Hola!",
            "english_translation": "Hello!",
            "is_final": True,
        }
    ]


@pytest.mark.asyncio
async def test_send_client_bidi_output_skips_translation_when_disabled(monkeypatch):
    sent_messages = []
    translate_calls = []

    class FakeWebSocket:
        async def send_json(self, message):
            sent_messages.append(message)

    def fake_translate(text, source):
        translate_calls.append((text, source))
        return "Hello!"

    monkeypatch.setattr("app.voice.translate_text_to_english", fake_translate)

    await send_client_bidi_output(
        FakeWebSocket(),
        {
            "type": "bidi_transcript_stream",
            "role": "assistant",
            "text": "¡Hola!",
            "is_final": True,
        },
        show_english_translations=False,
        target_language="es",
    )

    assert translate_calls == []
    assert sent_messages == [
        {
            "type": "transcript",
            "role": "assistant",
            "text": "¡Hola!",
            "is_final": True,
        }
    ]


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
        "message": VOICE_SESSION_GENERIC_ERROR_MESSAGE,
        "code": "ProviderError",
    }


def test_unrendered_bidi_events_are_ignored():
    assert bidi_event_to_client_message({"type": "bidi_usage", "totalTokens": 1}) is None


def test_voice_session_error_message_handles_nova_sonic_system_instability():
    from aws_sdk_bedrock_runtime.models import ValidationException

    error = ValidationException(message="System instability detected")

    assert voice_session_error_message(error) == VOICE_SESSION_TEMPORARY_ERROR_MESSAGE


def test_websocket_startup_failure_returns_error_message_and_logs_exception(monkeypatch, caplog):
    import logging

    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app import voice

    def fail_create_bidi_agent(_system_prompt: str):
        raise RuntimeError("provider startup failed")

    monkeypatch.setattr(voice, "create_bidi_agent", fail_create_bidi_agent)

    app = FastAPI()
    app.include_router(voice.router)

    caplog.set_level(logging.ERROR, logger="app.voice")

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
            "message": VOICE_SESSION_GENERIC_ERROR_MESSAGE,
        }

    assert "Voice WebSocket session failed" in caplog.text
    assert "RuntimeError: provider startup failed" in caplog.text


def test_websocket_system_instability_returns_retry_message(monkeypatch):
    from aws_sdk_bedrock_runtime.models import ValidationException
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app import voice

    def fail_create_bidi_agent(_system_prompt: str):
        raise ValidationException(message="System instability detected")

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
            "message": VOICE_SESSION_TEMPORARY_ERROR_MESSAGE,
        }
