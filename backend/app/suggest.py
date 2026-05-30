"""Reply suggestion endpoint for when the learner pauses during a session."""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter
from pydantic import BaseModel

from app.config import get_settings

router = APIRouter(tags=["suggest"])
logger = logging.getLogger(__name__)


class TranscriptEntry(BaseModel):
    role: str
    text: str


class SuggestRequest(BaseModel):
    transcript: list[TranscriptEntry]
    target_language: str
    scenario_context: str | None = None


class SuggestResponse(BaseModel):
    suggestion: str
    translation: str


def _build_suggest_prompt(request: SuggestRequest) -> str:
    recent = request.transcript[-6:] if len(request.transcript) > 6 else request.transcript
    conversation = "\n".join(f"{e.role}: {e.text}" for e in recent)

    return f"""You are helping a language learner who is practicing {request.target_language}.
They are in a conversation and have paused. Based on the recent conversation, suggest ONE short,
natural reply they could say next in {request.target_language}.

Recent conversation:
{conversation}

Respond with ONLY a JSON object in this exact format:
{{"suggestion": "<reply in {request.target_language}>", "translation": "<English translation>"}}

Keep the suggestion short (under 15 words), natural, and appropriate for the conversation context.
Do not include any other text."""


@router.post("/suggest", response_model=SuggestResponse)
async def suggest_reply(request: SuggestRequest) -> SuggestResponse:
    """Generate a contextual reply suggestion for the learner."""
    if not request.transcript:
        return SuggestResponse(suggestion="", translation="")

    settings = get_settings()

    try:
        import boto3

        client = boto3.client("bedrock-runtime", region_name=settings.aws_region)
        prompt = _build_suggest_prompt(request)

        response = client.invoke_model(
            modelId="us.amazon.nova-lite-v1:0",
            contentType="application/json",
            accept="application/json",
            body=json.dumps({
                "messages": [{"role": "user", "content": [{"text": prompt}]}],
                "inferenceConfig": {"maxTokens": 100, "temperature": 0.7},
            }),
        )

        body = json.loads(response["body"].read())
        output_text = body.get("output", {}).get("message", {}).get("content", [{}])[0].get("text", "")

        # Parse the JSON response
        parsed = json.loads(output_text.strip())
        return SuggestResponse(
            suggestion=parsed.get("suggestion", ""),
            translation=parsed.get("translation", ""),
        )
    except Exception as exc:
        logger.warning("Suggestion generation failed: %s", exc)
        # Return empty suggestion on failure — the frontend will just not show anything
        return SuggestResponse(suggestion="", translation="")
