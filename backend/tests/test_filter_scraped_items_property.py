"""Property-based tests for TripAdvisor filter logic.

**Validates: Requirements 11.11**

Property 12: Scraped item filtering correctness
- Items with isClosed=True are always excluded
- Items missing name are always excluded
- Items missing address are always excluded
- Items with type not in (ATTRACTION, RESTAURANT, HOTEL) are always excluded
- Valid items (open, has name, has address, valid type) are always retained
"""

from hypothesis import given, settings
from hypothesis import strategies as st

from app.scenario_agent import filter_scraped_items

VALID_TYPES = ("ATTRACTION", "RESTAURANT", "HOTEL")

# Strategy for a valid scraped item that should always pass the filter
valid_item_strategy = st.fixed_dictionaries(
    {
        "name": st.text(min_size=1),
        "address": st.text(min_size=1),
        "type": st.sampled_from(VALID_TYPES),
        "isClosed": st.just(False),
    },
    optional={
        "rating": st.floats(min_value=1.0, max_value=5.0),
        "category": st.text(min_size=1),
        "cuisine": st.lists(st.text(min_size=1), max_size=3),
    },
)

# Strategy for an invalid type (not in the valid set)
invalid_type_strategy = st.text(min_size=1).filter(lambda t: t not in VALID_TYPES)


class TestFilterExcludesClosedItems:
    """Property: Items with isClosed=True are always excluded."""

    @given(
        name=st.text(min_size=1),
        address=st.text(min_size=1),
        item_type=st.sampled_from(VALID_TYPES),
    )
    @settings(max_examples=100)
    def test_closed_items_excluded(self, name, address, item_type):
        item = {
            "name": name,
            "address": address,
            "type": item_type,
            "isClosed": True,
        }
        result = filter_scraped_items([item])
        assert result == [], f"Closed item should be excluded: {item}"


class TestFilterExcludesMissingName:
    """Property: Items missing name are always excluded."""

    @given(
        address=st.text(min_size=1),
        item_type=st.sampled_from(VALID_TYPES),
    )
    @settings(max_examples=100)
    def test_missing_name_excluded(self, address, item_type):
        # Item with no "name" key at all
        item = {"address": address, "type": item_type, "isClosed": False}
        result = filter_scraped_items([item])
        assert result == [], f"Item without name should be excluded: {item}"

    @given(
        address=st.text(min_size=1),
        item_type=st.sampled_from(VALID_TYPES),
    )
    @settings(max_examples=100)
    def test_empty_name_excluded(self, address, item_type):
        # Item with empty string name
        item = {"name": "", "address": address, "type": item_type, "isClosed": False}
        result = filter_scraped_items([item])
        assert result == [], f"Item with empty name should be excluded: {item}"

    @given(
        address=st.text(min_size=1),
        item_type=st.sampled_from(VALID_TYPES),
    )
    @settings(max_examples=100)
    def test_none_name_excluded(self, address, item_type):
        # Item with None name
        item = {"name": None, "address": address, "type": item_type, "isClosed": False}
        result = filter_scraped_items([item])
        assert result == [], f"Item with None name should be excluded: {item}"


class TestFilterExcludesMissingAddress:
    """Property: Items missing address are always excluded."""

    @given(
        name=st.text(min_size=1),
        item_type=st.sampled_from(VALID_TYPES),
    )
    @settings(max_examples=100)
    def test_missing_address_excluded(self, name, item_type):
        # Item with no "address" key at all
        item = {"name": name, "type": item_type, "isClosed": False}
        result = filter_scraped_items([item])
        assert result == [], f"Item without address should be excluded: {item}"

    @given(
        name=st.text(min_size=1),
        item_type=st.sampled_from(VALID_TYPES),
    )
    @settings(max_examples=100)
    def test_empty_address_excluded(self, name, item_type):
        # Item with empty string address
        item = {"name": name, "address": "", "type": item_type, "isClosed": False}
        result = filter_scraped_items([item])
        assert result == [], f"Item with empty address should be excluded: {item}"

    @given(
        name=st.text(min_size=1),
        item_type=st.sampled_from(VALID_TYPES),
    )
    @settings(max_examples=100)
    def test_none_address_excluded(self, name, item_type):
        # Item with None address
        item = {"name": name, "address": None, "type": item_type, "isClosed": False}
        result = filter_scraped_items([item])
        assert result == [], f"Item with None address should be excluded: {item}"


class TestFilterExcludesInvalidType:
    """Property: Items with type not in (ATTRACTION, RESTAURANT, HOTEL) are always excluded."""

    @given(
        name=st.text(min_size=1),
        address=st.text(min_size=1),
        invalid_type=invalid_type_strategy,
    )
    @settings(max_examples=100)
    def test_invalid_type_excluded(self, name, address, invalid_type):
        item = {
            "name": name,
            "address": address,
            "type": invalid_type,
            "isClosed": False,
        }
        result = filter_scraped_items([item])
        assert result == [], f"Item with invalid type '{invalid_type}' should be excluded: {item}"

    @given(
        name=st.text(min_size=1),
        address=st.text(min_size=1),
    )
    @settings(max_examples=100)
    def test_missing_type_excluded(self, name, address):
        # Item with no "type" key at all
        item = {"name": name, "address": address, "isClosed": False}
        result = filter_scraped_items([item])
        assert result == [], f"Item without type should be excluded: {item}"


class TestFilterRetainsValidItems:
    """Property: Valid items (open, has name, has address, valid type) are always retained."""

    @given(valid_item=valid_item_strategy)
    @settings(max_examples=200)
    def test_valid_items_retained(self, valid_item):
        result = filter_scraped_items([valid_item])
        assert len(result) == 1, f"Valid item should be retained: {valid_item}"
        assert result[0] == valid_item

    @given(valid_items=st.lists(valid_item_strategy, min_size=1, max_size=10))
    @settings(max_examples=100)
    def test_all_valid_items_retained(self, valid_items):
        result = filter_scraped_items(valid_items)
        assert len(result) == len(valid_items), (
            f"All {len(valid_items)} valid items should be retained, got {len(result)}"
        )

    @given(
        valid_items=st.lists(valid_item_strategy, min_size=1, max_size=5),
        invalid_items=st.lists(
            st.fixed_dictionaries(
                {
                    "name": st.text(min_size=1),
                    "address": st.text(min_size=1),
                    "type": st.sampled_from(VALID_TYPES),
                    "isClosed": st.just(True),
                }
            ),
            min_size=1,
            max_size=5,
        ),
    )
    @settings(max_examples=100)
    def test_mixed_list_retains_only_valid(self, valid_items, invalid_items):
        mixed = valid_items + invalid_items
        result = filter_scraped_items(mixed)
        assert len(result) == len(valid_items), (
            f"Expected {len(valid_items)} valid items, got {len(result)}"
        )
        for item in result:
            assert item.get("isClosed") is False
            assert item.get("name")
            assert item.get("address")
            assert item.get("type") in VALID_TYPES
