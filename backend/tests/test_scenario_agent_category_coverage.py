"""Property-based test for category coverage in generated scenarios.

**Validates: Requirements 11.5**

Property 15: When scraped items contain at least one valid item per category
(ATTRACTION, RESTAURANT, HOTEL), the output scenarios cover all three categories.
"""

from hypothesis import given, settings
from hypothesis.strategies import composite, integers, lists, text

from app.scenario_agent import SCENARIO_TEMPLATES, filter_scraped_items, transform_to_scenarios


@composite
def valid_scraped_item(draw, item_type: str):
    """Generate a valid scraped item for a given category type."""
    name = draw(text(min_size=1, max_size=50, alphabet="abcdefghijklmnopqrstuvwxyz "))
    address = draw(text(min_size=1, max_size=100, alphabet="abcdefghijklmnopqrstuvwxyz0123456789 ,"))
    return {
        "type": item_type,
        "name": name,
        "address": address,
        "isClosed": False,
    }


@composite
def items_with_all_categories(draw):
    """Generate a list of scraped items that includes at least one valid item per category."""
    # Ensure at least one item per category
    attraction = draw(valid_scraped_item("ATTRACTION"))
    restaurant = draw(valid_scraped_item("RESTAURANT"))
    hotel = draw(valid_scraped_item("HOTEL"))

    # Optionally add extra items of any category
    extra_attractions = draw(lists(valid_scraped_item("ATTRACTION"), min_size=0, max_size=3))
    extra_restaurants = draw(lists(valid_scraped_item("RESTAURANT"), min_size=0, max_size=3))
    extra_hotels = draw(lists(valid_scraped_item("HOTEL"), min_size=0, max_size=3))

    all_items = [attraction, restaurant, hotel] + extra_attractions + extra_restaurants + extra_hotels
    return all_items


@given(items=items_with_all_categories())
@settings(max_examples=200)
def test_category_coverage_in_generated_scenarios(items: list[dict]):
    """
    **Validates: Requirements 11.5**

    Property 15: When input items include at least one valid item per category
    (ATTRACTION, RESTAURANT, HOTEL), the transformed scenarios cover all three
    categories (verified by checking scenario titles contain the expected template
    patterns like "Ask for directions", "Order food", "Check in").
    """
    # Filter items (all should pass since they are valid)
    filtered = filter_scraped_items(items)

    # Verify precondition: at least one item per category survived filtering
    filtered_types = {item["type"] for item in filtered}
    assert "ATTRACTION" in filtered_types
    assert "RESTAURANT" in filtered_types
    assert "HOTEL" in filtered_types

    # Transform to scenarios
    scenarios = transform_to_scenarios(filtered, "TestCity", "es")

    # Verify all three category patterns are present in scenario titles
    titles = [s.title for s in scenarios]

    has_attraction = any("Ask for directions" in title for title in titles)
    has_restaurant = any("Order food" in title for title in titles)
    has_hotel = any("Check in" in title for title in titles)

    assert has_attraction, (
        f"No attraction scenario found (expected 'Ask for directions' pattern). Titles: {titles}"
    )
    assert has_restaurant, (
        f"No restaurant scenario found (expected 'Order food' pattern). Titles: {titles}"
    )
    assert has_hotel, (
        f"No hotel scenario found (expected 'Check in' pattern). Titles: {titles}"
    )
