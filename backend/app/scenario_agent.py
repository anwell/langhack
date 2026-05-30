"""Generated scenario endpoint.

The production path can call Apify-powered research. This MVP keeps the server
stateless and returns deterministic pedagogical scenarios when external scenario
generation is unavailable.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.config import get_settings
from app.scenarios import Scenario

router = APIRouter(prefix="/scenarios", tags=["scenario-generation"])


class ScenarioGenerationRequest(BaseModel):
    target_language: str
    source_language: str = "en"
    proficiency: str | None = None


class ScenarioGenerationResponse(BaseModel):
    success: bool
    status: Literal["generated", "fallback", "unavailable"]
    scenarios: list[Scenario] = Field(default_factory=list)
    message: str | None = None


TOPIC_BY_LANGUAGE: dict[str, list[tuple[str, str, list[str]]]] = {
    "es": [
        (
            "Pharmacy advice",
            "Explain simple symptoms, ask for medicine directions, and confirm dosage instructions.",
            ["me duele", "resfriado", "cada ocho horas", "farmacia"],
        ),
        (
            "Train station help",
            "Buy a ticket, ask about departure platforms, and clarify delays or transfers.",
            ["boleto", "andén", "retraso", "transbordo"],
        ),
    ],
    "fr": [
        (
            "Bakery breakfast",
            "Order breakfast at a bakery, ask what is fresh, and handle payment politely.",
            ["boulangerie", "croissant", "c'est frais", "carte bancaire"],
        ),
        (
            "Museum visit",
            "Ask about tickets, opening hours, exhibits, and audio-guide options.",
            ["billet", "horaires", "exposition", "audioguide"],
        ),
    ],
}


def _fallback_scenarios(target_language: str, source_language: str, proficiency: str | None) -> list[Scenario]:
    topics = TOPIC_BY_LANGUAGE.get(
        target_language,
        [
            (
                "Neighborhood introduction",
                "Introduce yourself to a neighbor, share basic details, and ask simple questions.",
                ["hello", "my name is", "I live nearby", "nice to meet you"],
            )
        ],
    )
    now = datetime.now(UTC).isoformat()
    level_note = f" for a {proficiency} learner" if proficiency else ""
    return [
        Scenario(
            id=f"generated-{target_language}-{index + 1}-{title.lower().replace(' ', '-')}",
            title=title,
            description=description,
            target_language=target_language,
            key_vocabulary=vocabulary,
            system_prompt=(
                f"Role-play '{title}' in {target_language}{level_note}. "
                f"Give support in {source_language} only when the learner asks."
            ),
            source="generated",
            created_at=now,
        )
        for index, (title, description, vocabulary) in enumerate(topics[:3])
    ]


@router.post("/generate", response_model=ScenarioGenerationResponse)
async def generate_scenarios(request: ScenarioGenerationRequest) -> ScenarioGenerationResponse:
    """Generate stateless scenario suggestions.

    If an Apify token is configured this endpoint is ready to be extended with a
    live Actor call; the deterministic fallback keeps the client flow useful and
    satisfies the API contract when generation infrastructure is unavailable.
    """
    settings = get_settings()
    scenarios = _fallback_scenarios(
        request.target_language,
        request.source_language,
        request.proficiency,
    )
    return ScenarioGenerationResponse(
        success=bool(scenarios),
        status="fallback" if settings.apify_token else "unavailable",
        scenarios=scenarios,
        message=(
            "Returned generated fallback scenarios; Apify live generation is not configured in this MVP path."
            if settings.apify_token
            else "Apify token unavailable; returned local fallback scenarios."
        ),
    )
