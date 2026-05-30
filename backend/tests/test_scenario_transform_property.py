"""Property-based tests for transform_to_scenarios().

**Validates: Requirements 11.4, 11.6, 11.7**

Property 13: Travel scenario schema conformance
- Every output scenario has a non-empty id
- Every output scenario has a non-empty title
- Every output scenario has a description of 150 chars or fewer
- Every output scenario has the correct target_language
- Every output scenario has non-empty key_vocabulary list
- Every output scenario has a non-empty system_prompt
- Every output scenario has source="generated"
"""

from hypothesis import given, settings
from hypothesis import strategies as st

from app.scenario_agent import SCENARIO_TEMPLATES, transform_to_scenarios

# Strategy for valid TripAdvisor scraped items (already filtered)
valid_types = st.sampled_from(list(SCENARIO_TEMPLATES.keys()))

scraped_item_strategy = st.fixed_dictionaries(
    {
        "name": st.text(min_size=1, max_size=60).filter(lambda s: s.strip()),
        "address": st.text(min_size=1, max_size=100).filter(lambda s: s.strip()),
        "type": valid_types,
    },
    optional={
        "category": st.text(min_size=1, max_size=40),
        "cuisine": st.lists(st.text(min_size=1, max_size=30), min_size=1, max_size=5),
    },
)

items_strategy = st.lists(scraped_item_strategy, min_size=1, max_size=10)

destination_strategy = st.text(min_size=1, max_size=50).filter(lambda s: s.strip())

target_language_strategy = st.sampled_from(["es", "fr", "de", "it", "pt", "ja", "ko", "zh"])


@given(
    items=items_strategy,
    destination=destination_strategy,
    target_language=target_language_strategy,
)
@settings(max_examples=200)
def test_transform_scenarios_have_non_empty_id(items, destination, target_language):
    """Every output scenario has a non-empty id."""
    scenarios = transform_to_scenarios(items, destination, target_language)
    for scenario in scenarios:
        assert scenario.id, "Scenario id must be non-empty"


@given(
    items=items_strategy,
    destination=destination_strategy,
    target_language=target_language_strategy,
)
@settings(max_examples=200)
def test_transform_scenarios_have_non_empty_title(items, destination, target_language):
    """Every output scenario has a non-empty title."""
    scenarios = transform_to_scenarios(items, destination, target_language)
    for scenario in scenarios:
        assert scenario.title, "Scenario title must be non-empty"


@given(
    items=items_strategy,
    destination=destination_strategy,
    target_language=target_language_strategy,
)
@settings(max_examples=200)
def test_transform_scenarios_description_max_150_chars(items, destination, target_language):
    """Every output scenario has a description of 150 chars or fewer."""
    scenarios = transform_to_scenarios(items, destination, target_language)
    for scenario in scenarios:
        assert len(scenario.description) <= 150, (
            f"Description exceeds 150 chars: {len(scenario.description)}"
        )


@given(
    items=items_strategy,
    destination=destination_strategy,
    target_language=target_language_strategy,
)
@settings(max_examples=200)
def test_transform_scenarios_have_correct_target_language(items, destination, target_language):
    """Every output scenario has the correct target_language."""
    scenarios = transform_to_scenarios(items, destination, target_language)
    for scenario in scenarios:
        assert scenario.target_language == target_language, (
            f"Expected target_language={target_language}, got {scenario.target_language}"
        )


@given(
    items=items_strategy,
    destination=destination_strategy,
    target_language=target_language_strategy,
)
@settings(max_examples=200)
def test_transform_scenarios_have_non_empty_key_vocabulary(items, destination, target_language):
    """Every output scenario has non-empty key_vocabulary list."""
    scenarios = transform_to_scenarios(items, destination, target_language)
    for scenario in scenarios:
        assert len(scenario.key_vocabulary) > 0, "key_vocabulary must be non-empty"


@given(
    items=items_strategy,
    destination=destination_strategy,
    target_language=target_language_strategy,
)
@settings(max_examples=200)
def test_transform_scenarios_have_non_empty_system_prompt(items, destination, target_language):
    """Every output scenario has a non-empty system_prompt."""
    scenarios = transform_to_scenarios(items, destination, target_language)
    for scenario in scenarios:
        assert scenario.system_prompt, "system_prompt must be non-empty"


@given(
    items=items_strategy,
    destination=destination_strategy,
    target_language=target_language_strategy,
)
@settings(max_examples=200)
def test_transform_scenarios_have_source_generated(items, destination, target_language):
    """Every output scenario has source="generated"."""
    scenarios = transform_to_scenarios(items, destination, target_language)
    for scenario in scenarios:
        assert scenario.source == "generated", (
            f"Expected source='generated', got '{scenario.source}'"
        )
