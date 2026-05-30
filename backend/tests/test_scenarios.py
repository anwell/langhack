from collections import Counter

from fastapi.testclient import TestClient

from app.main import app
from app.scenarios import PRELOADED_SCENARIOS


def test_preloaded_scenarios_cover_supported_languages():
    counts = Counter(scenario.target_language for scenario in PRELOADED_SCENARIOS)

    assert counts["es"] >= 5
    assert counts["fr"] >= 5


def test_preloaded_scenarios_have_unique_ids_and_short_descriptions():
    ids = [scenario.id for scenario in PRELOADED_SCENARIOS]

    assert len(ids) == len(set(ids))
    assert all(scenario.title for scenario in PRELOADED_SCENARIOS)
    assert all(scenario.description for scenario in PRELOADED_SCENARIOS)
    assert all(len(scenario.description) <= 150 for scenario in PRELOADED_SCENARIOS)


def test_list_scenarios_filters_by_target_language():
    client = TestClient(app)

    response = client.get("/scenarios", params={"target_language": "fr"})

    assert response.status_code == 200
    scenarios = response.json()
    assert len(scenarios) >= 5
    assert {scenario["target_language"] for scenario in scenarios} == {"fr"}


def test_get_scenario_returns_single_catalog_item():
    client = TestClient(app)

    response = client.get("/scenarios/es-cafe-order")

    assert response.status_code == 200
    assert response.json()["id"] == "es-cafe-order"
