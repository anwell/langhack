"""Property-based tests for default destination selection.

**Validates: Requirements 11.2**

Property 14: Default destination mapping completeness
- Every value in DEFAULT_DESTINATIONS is a non-empty string
- Accessing an unknown language via .get() returns None without raising KeyError
- All expected languages (es, fr, de, it, pt, ja, ko, zh) are present
"""

from hypothesis import given, settings
from hypothesis.strategies import sampled_from, text

from app.scenario_agent import DEFAULT_DESTINATIONS

EXPECTED_LANGUAGES = ["es", "fr", "de", "it", "pt", "ja", "ko", "zh"]


@given(lang=sampled_from(list(DEFAULT_DESTINATIONS.keys())))
@settings(max_examples=200)
def test_every_destination_value_is_nonempty_string(lang: str):
    """
    **Validates: Requirements 11.2**

    Property 14.1: Every value in DEFAULT_DESTINATIONS is a non-empty string.
    For every language key in the dict, the mapped city must be a string with
    at least one character.
    """
    city = DEFAULT_DESTINATIONS[lang]
    assert isinstance(city, str), f"Expected str for language '{lang}', got {type(city)}"
    assert len(city) > 0, f"Expected non-empty city for language '{lang}', got empty string"


@given(lang=text(min_size=1, max_size=10))
@settings(max_examples=200)
def test_unknown_language_returns_none_no_keyerror(lang: str):
    """
    **Validates: Requirements 11.2**

    Property 14.2: Accessing an unknown language via .get() returns None
    without raising a KeyError. This ensures the fallback logic in the
    generate endpoint works safely for any arbitrary language code.
    """
    # If the generated language happens to be in the dict, skip the None assertion
    # but still verify no exception is raised
    result = DEFAULT_DESTINATIONS.get(lang)
    if lang not in DEFAULT_DESTINATIONS:
        assert result is None, (
            f"Expected None for unknown language '{lang}', got {result!r}"
        )


def test_all_expected_languages_are_present():
    """
    **Validates: Requirements 11.2**

    Property 14.3: All expected languages (es, fr, de, it, pt, ja, ko, zh)
    are present as keys in DEFAULT_DESTINATIONS.
    """
    for lang in EXPECTED_LANGUAGES:
        assert lang in DEFAULT_DESTINATIONS, (
            f"Expected language '{lang}' not found in DEFAULT_DESTINATIONS. "
            f"Available keys: {list(DEFAULT_DESTINATIONS.keys())}"
        )
        # Also verify the value is a non-empty string
        city = DEFAULT_DESTINATIONS[lang]
        assert isinstance(city, str) and len(city) > 0, (
            f"Language '{lang}' maps to invalid city: {city!r}"
        )
