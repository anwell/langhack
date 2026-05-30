"""WebSocket endpoint for real-time voice conversation via Strands BidiAgent.

Provides the /ws WebSocket endpoint that creates a per-connection BidiAgent
backed by Amazon Nova Sonic v2 for bidirectional voice streaming.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from strands.experimental.bidi import BidiAgent
from strands.experimental.bidi.models import BidiNovaSonicModel
from strands.experimental.bidi.tools import stop_conversation

from app.config import get_settings
from app.prompts import build_conversation_prompt
from app.tools import get_vocabulary_hint, signal_session_complete

router = APIRouter()
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


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """Real-time voice session via BidiAgent.

    Each WebSocket connection gets its own BidiAgent instance.
    The system prompt is constructed from the scenario context and target language
    sent by the client in the initial JSON message.

    Protocol:
        1. Client connects via WebSocket
        2. Client sends initial JSON: {scenario_context, target_language, scenario_id}
        3. BidiAgent streams audio bidirectionally until session ends
        4. Connection closes on disconnect or stop_conversation tool call
    """
    await ws.accept()

    # First message contains session configuration
    init_msg = await ws.receive_json()
    scenario_context = init_msg.get("scenario_context", "")
    target_language = init_msg.get("target_language", "")

    system_prompt = build_conversation_prompt(scenario_context, target_language)

    agent = BidiAgent(
        model=sonic_model,
        tools=[get_vocabulary_hint, signal_session_complete, stop_conversation],
        system_prompt=system_prompt,
    )

    try:
        await agent.run(
            inputs=[ws.receive_json],
            outputs=[ws.send_json],
        )
    except WebSocketDisconnect:
        pass
    finally:
        await agent.stop()
