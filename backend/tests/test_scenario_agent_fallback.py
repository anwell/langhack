"""Tests for scenario agent fallback handling.

Verifies that the generate_scenarios endpoint gracefully falls back to
_fallback_scenarios() when the TripAdvisor scraper fails or returns empty
results, always returning success=True with status="fallback".
"""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def _clear_settings_cache():
    """Clear the lru_cache on get_settings between tests."""
    from app.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


class TestScraperFallbackOnException:
    """When invoke_tripadvisor_scraper raises an exception, endpoint falls back."""

    @patch("app.scenario_agent.invoke_tripadvisor_scraper", new_callable=AsyncMock)
    @patch.dict("os.environ", {"APIFY_TOKEN": "test-token"})
    def test_scraper_exception_returns_fallback(self, mock_scraper):
        mock_scraper.side_effect = RuntimeError("Connection refused")

        response = client.post(
            "/scenarios/generate",
            json={"target_language": "es", "destination": "Barcelona"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["status"] == "fallback"
        assert len(data["scenarios"]) > 0

    @patch("app.scenario_agent.invoke_tripadvisor_scraper", new_callable=AsyncMock)
    @patch.dict("os.environ", {"APIFY_TOKEN": "test-token"})
    def test_scraper_timeout_returns_fallback(self, mock_scraper):
        import httpx

        mock_scraper.side_effect = httpx.TimeoutException("Request timed out")

        response = client.post(
            "/scenarios/generate",
            json={"target_language": "fr", "destination": "Paris"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["status"] == "fallback"
        assert len(data["scenarios"]) > 0


class TestScraperFallbackOnEmptyResults:
    """When invoke_tripadvisor_scraper returns empty list, endpoint falls back."""

    @patch("app.scenario_agent.invoke_tripadvisor_scraper", new_callable=AsyncMock)
    @patch.dict("os.environ", {"APIFY_TOKEN": "test-token"})
    def test_empty_scraper_results_returns_fallback(self, mock_scraper):
        mock_scraper.return_value = []

        response = client.post(
            "/scenarios/generate",
            json={"target_language": "es", "destination": "Barcelona"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["status"] == "fallback"
        assert len(data["scenarios"]) > 0

    @patch("app.scenario_agent.invoke_tripadvisor_scraper", new_callable=AsyncMock)
    @patch.dict("os.environ", {"APIFY_TOKEN": "test-token"})
    def test_scraper_results_all_filtered_out_returns_fallback(self, mock_scraper):
        # Return items that will all be filtered out (closed establishments)
        mock_scraper.return_value = [
            {"name": "Closed Place", "address": "123 St", "type": "ATTRACTION", "isClosed": True},
            {"name": "No Address", "type": "RESTAURANT"},  # missing address
            {"name": "Bad Type", "address": "456 Ave", "type": "INVALID"},
        ]

        response = client.post(
            "/scenarios/generate",
            json={"target_language": "es", "destination": "Barcelona"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["status"] == "fallback"
        assert len(data["scenarios"]) > 0


class TestFallbackNeverExposesErrors:
    """The client never sees error details from scraper failures."""

    @patch("app.scenario_agent.invoke_tripadvisor_scraper", new_callable=AsyncMock)
    @patch.dict("os.environ", {"APIFY_TOKEN": "test-token"})
    def test_error_message_not_in_response(self, mock_scraper):
        mock_scraper.side_effect = RuntimeError("SECRET_API_KEY_INVALID")

        response = client.post(
            "/scenarios/generate",
            json={"target_language": "es", "destination": "Barcelona"},
        )

        data = response.json()
        # The error message should not leak to the client
        assert "SECRET_API_KEY_INVALID" not in str(data)
        assert data["success"] is True
        assert data["status"] == "fallback"


class TestFallbackWithNoDestination:
    """When no destination is available, endpoint returns fallback without scraping."""

    @patch.dict("os.environ", {"APIFY_TOKEN": "test-token"})
    def test_unknown_language_no_default_destination(self):
        response = client.post(
            "/scenarios/generate",
            json={"target_language": "xx"},  # unknown language, no default destination
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["status"] == "fallback"
        assert len(data["scenarios"]) > 0


class TestSuccessfulScraping:
    """When scraping succeeds, endpoint returns generated scenarios."""

    @patch("app.scenario_agent.invoke_tripadvisor_scraper", new_callable=AsyncMock)
    @patch.dict("os.environ", {"APIFY_TOKEN": "test-token"})
    def test_successful_scrape_returns_generated(self, mock_scraper):
        mock_scraper.return_value = [
            {
                "name": "Sagrada Familia",
                "address": "Carrer de Mallorca, 401",
                "type": "ATTRACTION",
                "category": "Architectural Buildings",
            },
            {
                "name": "Can Culleretes",
                "address": "Carrer d'en Quintana, 5",
                "type": "RESTAURANT",
                "cuisine": ["Catalan", "Mediterranean"],
            },
        ]

        response = client.post(
            "/scenarios/generate",
            json={"target_language": "es", "destination": "Barcelona"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["status"] == "generated"
        assert len(data["scenarios"]) == 2
