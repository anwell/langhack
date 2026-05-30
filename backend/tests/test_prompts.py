"""Property-based tests for the system prompt builder."""

from hypothesis import given, settings
from hypothesis.strategies import text

from app.prompts import build_conversation_prompt


@given(
    scenario_context=text(min_size=1),
    target_language=text(min_size=1),
)
@settings(max_examples=200)
def test_system_prompt_includes_scenario_and_language(
    scenario_context: str, target_language: str
):
    """
    **Validates: Requirements 2.3, 6.3**

    Property 3: The system prompt produced by build_conversation_prompt always
    contains both the scenario_context string and the target_language string.
    """
    prompt = build_conversation_prompt(scenario_context, target_language)

    assert scenario_context in prompt, (
        f"scenario_context not found in prompt. "
        f"scenario_context={scenario_context!r}"
    )
    assert target_language in prompt, (
        f"target_language not found in prompt. "
        f"target_language={target_language!r}"
    )
