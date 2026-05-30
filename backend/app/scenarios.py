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
        id="es-pharmacy-symptoms",
        title="Visit a pharmacy",
        description="Explain simple symptoms, ask for medicine, and confirm dosage and safety instructions.",
        target_language="es",
        key_vocabulary=["me duele", "resfriado", "cada ocho horas", "receta"],
        system_prompt="You are a pharmacist helping a Spanish learner describe symptoms and choose basic medicine.",
        created_at="2026-01-01T00:00:00Z",
    ),
    Scenario(
        id="es-train-ticket",
        title="Buy a train ticket",
        description="Ask about routes, buy a ticket, confirm the platform, and understand delay announcements.",
        target_language="es",
        key_vocabulary=["boleto", "andén", "ida y vuelta", "retraso"],
        system_prompt="You are a train station clerk helping a traveler buy a ticket in Spanish.",
        created_at="2026-01-01T00:00:00Z",
    ),
    Scenario(
        id="es-restaurant-problem",
        title="Fix a restaurant order",
        description="Politely explain an order mistake, ask for a replacement, and respond to apologies.",
        target_language="es",
        key_vocabulary=["disculpe", "pedí", "sin", "¿me lo puede cambiar?"],
        system_prompt="You are a restaurant server helping a Spanish learner resolve an order problem politely.",
        created_at="2026-01-01T00:00:00Z",
    ),
    Scenario(
        id="es-make-plans",
        title="Make weekend plans",
        description="Invite a friend out, compare options, agree on a time, and confirm where to meet.",
        target_language="es",
        key_vocabulary=["¿te apetece?", "quedamos", "a las", "nos vemos"],
        system_prompt="You are a friendly classmate making weekend plans with a Spanish learner.",
        created_at="2026-01-01T00:00:00Z",
    ),
    Scenario(
        id="es-airbnb-checkin",
        title="Apartment check-in",
        description="Coordinate arrival, ask about keys, Wi-Fi, house rules, and checkout time.",
        target_language="es",
        key_vocabulary=["llaves", "llegar", "contraseña", "salida"],
        system_prompt="You are an apartment host helping a Spanish learner check in and understand house rules.",
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
    Scenario(
        id="fr-bakery-breakfast",
        title="Bakery breakfast",
        description="Order breakfast at a bakery, ask what is fresh, and handle payment politely.",
        target_language="fr",
        key_vocabulary=["boulangerie", "croissant", "c'est frais", "carte bancaire"],
        system_prompt="You are a bakery worker helping a French learner order breakfast.",
        created_at="2026-01-01T00:00:00Z",
    ),
    Scenario(
        id="fr-museum-visit",
        title="Museum visit",
        description="Ask about tickets, opening hours, exhibits, and audio-guide options.",
        target_language="fr",
        key_vocabulary=["billet", "horaires", "exposition", "audioguide"],
        system_prompt="You are a museum staff member helping a French learner plan a visit.",
        created_at="2026-01-01T00:00:00Z",
    ),
    Scenario(
        id="fr-doctor-appointment",
        title="Doctor appointment",
        description="Describe symptoms, answer basic questions, and understand care instructions.",
        target_language="fr",
        key_vocabulary=["j'ai mal", "fièvre", "depuis", "ordonnance"],
        system_prompt="You are a doctor asking clear questions to help a French learner describe symptoms.",
        created_at="2026-01-01T00:00:00Z",
    ),
    Scenario(
        id="fr-train-delay",
        title="Handle a train delay",
        description="Ask about a delay, find the right platform, and understand connection options.",
        target_language="fr",
        key_vocabulary=["retard", "voie", "correspondance", "prochain train"],
        system_prompt="You are a station employee helping a French learner handle a train delay.",
        created_at="2026-01-01T00:00:00Z",
    ),
    Scenario(
        id="fr-dinner-invitation",
        title="Accept a dinner invite",
        description="Respond to an invitation, discuss food preferences, and offer to bring something.",
        target_language="fr",
        key_vocabulary=["avec plaisir", "j'apporte", "je préfère", "à quelle heure"],
        system_prompt="You are a friendly host inviting a French learner to dinner.",
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
