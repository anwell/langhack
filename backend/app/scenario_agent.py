"""Generated scenario endpoint.

The production path can call Apify-powered research. This MVP keeps the server
stateless and returns deterministic pedagogical scenarios when external scenario
generation is unavailable.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Literal

import httpx
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.config import get_settings
from app.scenarios import Scenario

logger = logging.getLogger(__name__)

TRIPADVISOR_ACTOR_ID = "maxcopell~tripadvisor"

async def invoke_tripadvisor_scraper(
    destination: str,
    target_language: str,
) -> list[dict]:
    """Invoke the Apify TripAdvisor actor and return scraped results.

    Starts a run of the maxcopell/tripadvisor actor via the Apify REST API,
    waits for it to finish, then fetches the dataset items.

    Args:
        destination: City or region to scrape (e.g. "Barcelona").
        target_language: ISO 639-1 language code (e.g. "es").

    Returns:
        List of raw scraped item dicts on success, empty list on failure.
    """
    settings = get_settings()
    apify_token = settings.apify_token
    if not apify_token:
        logger.warning("Apify token not configured; skipping TripAdvisor scrape.")
        return []

    actor_input = {
        "query": destination,
        "maxItemsPerQuery": 20,
        "includeAttractions": True,
        "includeRestaurants": True,
        "includeHotels": True,
        "language": target_language,
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            # Start actor run with waitForFinish to avoid polling
            run_response = await client.post(
                f"https://api.apify.com/v2/acts/{TRIPADVISOR_ACTOR_ID}/runs",
                params={"token": apify_token, "waitForFinish": 60},
                json=actor_input,
            )
            run_response.raise_for_status()
            run_data = run_response.json().get("data", {})
            run_id = run_data.get("id")

            if not run_id:
                logger.warning("Apify actor run did not return a run ID.")
                return []

            # Fetch dataset items from the completed run
            dataset_response = await client.get(
                f"https://api.apify.com/v2/actor-runs/{run_id}/dataset/items",
                params={"token": apify_token},
            )
            dataset_response.raise_for_status()
            items = dataset_response.json()
            if isinstance(items, list):
                return items
            return []
    except (httpx.HTTPStatusError, httpx.RequestError, httpx.TimeoutException) as exc:
        logger.warning("TripAdvisor scraper invocation failed: %s", exc)
        return []
    except Exception as exc:  # noqa: BLE001
        logger.warning("Unexpected error during TripAdvisor scrape: %s", exc)
        return []


router = APIRouter(prefix="/scenarios", tags=["scenario-generation"])


class ScenarioGenerationRequest(BaseModel):
    target_language: str
    source_language: str = "en"
    proficiency: str | None = None
    destination: str | None = None


class ScenarioGenerationResponse(BaseModel):
    success: bool
    status: Literal["generated", "fallback", "unavailable"]
    scenarios: list[Scenario] = Field(default_factory=list)
    message: str | None = None


# Default destinations by language (used when no destination is specified)
DEFAULT_DESTINATIONS: dict[str, str] = {
    "es": "Barcelona",
    "fr": "Paris",
    "de": "Berlin",
    "it": "Rome",
    "pt": "Lisbon",
    "ja": "Tokyo",
    "ko": "Seoul",
    "zh": "Beijing",
}

SCENARIO_TEMPLATES: dict[str, dict[str, str | list[str]]] = {
    "ATTRACTION": {
        "title_template": "Ask for directions to {name}",
        "description_template": "Practice asking locals how to reach {name} ({category}), understand landmarks, and confirm walking directions.",
        "prompt_template": "You are a helpful local near {name} in {destination}. Help the learner find their way to {name} at {address}.",
        "vocab_base": ["¿Dónde está...?", "how far", "turn left", "straight ahead"],
    },
    "RESTAURANT": {
        "title_template": "Order food at {name}",
        "description_template": "Practice ordering a meal at {name}, asking about the menu, and handling payment.",
        "prompt_template": "You are a waiter at {name} in {destination} ({address}). Help the learner order food and navigate the menu.",
        "vocab_base": ["the menu", "I would like", "the bill", "recommend"],
    },
    "HOTEL": {
        "title_template": "Check in at {name}",
        "description_template": "Practice checking in at {name}, confirming your reservation, and asking about amenities.",
        "prompt_template": "You are a receptionist at {name} in {destination} ({address}). Help the learner check in and understand hotel services.",
        "vocab_base": ["reservation", "room key", "checkout time", "breakfast"],
    },
}


def filter_scraped_items(items: list[dict]) -> list[dict]:
    """Filter out closed establishments and entries with insufficient data."""
    return [
        item
        for item in items
        if not item.get("isClosed", False)
        and item.get("name")
        and item.get("address")
        and item.get("type") in ("ATTRACTION", "RESTAURANT", "HOTEL")
    ]


def transform_to_scenarios(
    items: list[dict],
    destination: str,
    target_language: str,
) -> list[Scenario]:
    """Transform filtered TripAdvisor items into Travel_Scenario objects."""
    scenarios = []
    for item in items:
        item_type = item["type"]
        template = SCENARIO_TEMPLATES[item_type]
        name = item["name"]

        # Build key_vocabulary from scraped content + template base
        key_vocab = list(template["vocab_base"])
        key_vocab.append(name)  # Include the real place name
        if item.get("address"):
            key_vocab.append(item["address"])
        if item.get("cuisine"):
            key_vocab.extend(item["cuisine"][:2])

        scenario = Scenario(
            id=f"generated-travel-{target_language}-{name.lower().replace(' ', '-')[:30]}",
            title=template["title_template"].format(name=name),
            description=template["description_template"].format(
                name=name, category=item.get("category", "landmark")
            )[:150],
            target_language=target_language,
            key_vocabulary=key_vocab,
            system_prompt=template["prompt_template"].format(
                name=name, destination=destination, address=item.get("address", "")
            ),
            source="generated",
            created_at=datetime.now(UTC).isoformat(),
        )
        scenarios.append(scenario)
    return scenarios


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

    If a destination is provided (or a default destination exists for the
    target_language), invokes the TripAdvisor scraper via Apify to produce
    Travel_Scenarios grounded in real place data. Falls back to deterministic
    pedagogical scenarios when scraping is unavailable or returns no results.

    The client always receives success=True with usable scenarios — scraper
    failures are logged server-side but never exposed to the caller.
    """
    # Determine effective destination: explicit param > default for language
    destination = request.destination or DEFAULT_DESTINATIONS.get(request.target_language)

    if destination:
        try:
            scraped_items = await invoke_tripadvisor_scraper(
                destination=destination,
                target_language=request.target_language,
            )
            if scraped_items:
                filtered = filter_scraped_items(scraped_items)
                if filtered:
                    scenarios = transform_to_scenarios(
                        filtered, destination, request.target_language
                    )
                    return ScenarioGenerationResponse(
                        success=True,
                        status="generated",
                        scenarios=scenarios,
                        message=f"Generated {len(scenarios)} travel scenarios for {destination}.",
                    )
                else:
                    logger.warning(
                        "TripAdvisor scraper returned items for '%s' but none passed filtering; falling back.",
                        destination,
                    )
            else:
                logger.warning(
                    "TripAdvisor scraper returned empty results for '%s'; falling back.",
                    destination,
                )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Scraper pipeline failed for destination '%s': %s; falling back to generic scenarios.",
                destination,
                exc,
            )

    # No destination available, scraping returned nothing, or scraper raised — use fallback
    scenarios = _fallback_scenarios(
        request.target_language,
        request.source_language,
        request.proficiency,
    )
    return ScenarioGenerationResponse(
        success=True,
        status="fallback",
        scenarios=scenarios,
        message=(
            "TripAdvisor scraping returned no usable results; returned fallback scenarios."
            if destination
            else "No destination specified and no default for language; returned fallback scenarios."
        ),
    )
