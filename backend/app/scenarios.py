"""Static scenario catalog endpoints."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/scenarios", tags=["scenarios"])


class Scenario(BaseModel):
    """A role-play scenario returned to the mobile app."""

    id: str
    title: str
    description: str = Field(max_length=150)
    target_language: str
    key_vocabulary: list[str] = Field(default_factory=list)
    system_prompt: str
    source: Literal["preloaded", "backend", "generated"] = "preloaded"
    created_at: str


PRELOADED_SCENARIOS: list[Scenario] = [
    Scenario(
        id="es-cafe-order",
        title="Order at a café",
        description="Practice ordering drinks and pastries, asking prices, and responding to follow-up questions.",
        target_language="es",
        key_vocabulary=["un café", "quisiera", "para llevar", "la cuenta"],
        system_prompt="You are a friendly barista in a busy Spanish-speaking café.",
        created_at="2026-01-01T00:00:00Z",
    ),
    Scenario(
        id="es-directions-plaza",
        title="Ask for directions",
        description="Ask a local how to reach a plaza, understand landmarks, and confirm walking directions.",
        target_language="es",
        key_vocabulary=["¿Dónde está...?", "gire", "siga derecho", "cerca de"],
        system_prompt="You are a helpful local giving simple directions in Spanish.",
        created_at="2026-01-01T00:00:00Z",
    ),
    Scenario(
        id="fr-hotel-checkin",
        title="Hotel check-in",
        description="Practice checking in, spelling your name, asking about breakfast, and confirming room details.",
        target_language="fr",
        key_vocabulary=["réservation", "petit déjeuner", "chambre", "clé"],
        system_prompt="You are a hotel receptionist helping a French learner check in.",
        created_at="2026-01-01T00:00:00Z",
    ),
    Scenario(
        id="fr-market-shopping",
        title="Market shopping",
        description="Buy produce at an outdoor market, ask quantities, compare prices, and make small talk.",
        target_language="fr",
        key_vocabulary=["je voudrais", "combien", "un kilo", "c'est tout"],
        system_prompt="You are a patient vendor at a French outdoor market.",
        created_at="2026-01-01T00:00:00Z",
    ),
]


@router.get("", response_model=list[Scenario])
async def list_scenarios(target_language: str | None = None) -> list[Scenario]:
    """Return the preloaded scenario list, optionally filtered by target language."""
    if target_language:
        return [scenario for scenario in PRELOADED_SCENARIOS if scenario.target_language == target_language]
    return PRELOADED_SCENARIOS


@router.get("/{scenario_id}", response_model=Scenario)
async def get_scenario(scenario_id: str) -> Scenario:
    """Return a single scenario by id."""
    for scenario in PRELOADED_SCENARIOS:
        if scenario.id == scenario_id:
            return scenario
    from fastapi import HTTPException

    raise HTTPException(status_code=404, detail="Scenario not found")
