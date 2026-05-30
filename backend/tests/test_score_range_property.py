"""Property-based tests for session score range validity.

**Validates: Requirements 10.20**

Property 16: Session score range validity
- build_feedback() always returns session_score in [0, 100] for any valid transcript input
- Any FeedbackRequest with at least one user transcript entry produces a valid score
"""

from hypothesis import given, settings
from hypothesis import strategies as st

from app.teacher_agent import (
    AvailableScenario,
    FeedbackRequest,
    TranscriptEntry,
    build_feedback,
)

# Strategy for a valid user transcript entry
user_entry_strategy = st.builds(
    TranscriptEntry,
    role=st.just("user"),
    text=st.text(min_size=1, max_size=200),
    timestamp=st.none(),
)

# Strategy for a valid assistant transcript entry
assistant_entry_strategy = st.builds(
    TranscriptEntry,
    role=st.just("assistant"),
    text=st.text(min_size=1, max_size=200),
    timestamp=st.none(),
)

# Strategy for a mixed transcript that always has at least one user entry
transcript_strategy = st.lists(
    st.one_of(user_entry_strategy, assistant_entry_strategy),
    min_size=0,
    max_size=20,
).flatmap(
    lambda entries: st.tuples(
        st.just(entries),
        user_entry_strategy,
    )
).map(
    lambda pair: pair[0] + [pair[1]]  # Ensure at least one user entry
)

# Strategy for available scenarios (optional)
available_scenario_strategy = st.lists(
    st.builds(
        AvailableScenario,
        id=st.text(min_size=1, max_size=30, alphabet=st.characters(categories=("L", "N", "Pd"))),
        title=st.text(min_size=1, max_size=100),
    ),
    min_size=0,
    max_size=5,
)

# Strategy for target language
target_language_strategy = st.sampled_from(["es", "fr", "de", "it", "pt", "ja", "ko", "zh"])

# Strategy for a valid FeedbackRequest with at least one user transcript entry
feedback_request_strategy = st.builds(
    FeedbackRequest,
    transcript=transcript_strategy,
    target_language=target_language_strategy,
    source_language=st.just("en"),
    available_scenarios=available_scenario_strategy,
)


class TestSessionScoreRangeValidity:
    """Property 16: Session score range validity.

    For any valid FeedbackRequest with at least one user transcript entry,
    build_feedback() must return a session_score in [0, 100].
    """

    @given(request=feedback_request_strategy)
    @settings(max_examples=200)
    def test_score_always_in_valid_range(self, request: FeedbackRequest):
        feedback = build_feedback(request)
        assert 0 <= feedback.session_score <= 100, (
            f"session_score {feedback.session_score} is outside [0, 100] "
            f"for transcript with {len(request.transcript)} entries"
        )

    @given(
        num_user_turns=st.integers(min_value=1, max_value=50),
        target_language=target_language_strategy,
    )
    @settings(max_examples=200)
    def test_score_in_range_for_varying_user_turn_counts(
        self, num_user_turns: int, target_language: str
    ):
        """Score stays in [0, 100] regardless of how many user turns exist."""
        transcript = [
            TranscriptEntry(role="user", text=f"Turn {i}")
            for i in range(num_user_turns)
        ]
        request = FeedbackRequest(
            transcript=transcript,
            target_language=target_language,
            source_language="en",
            available_scenarios=[],
        )
        feedback = build_feedback(request)
        assert 0 <= feedback.session_score <= 100, (
            f"session_score {feedback.session_score} is outside [0, 100] "
            f"for {num_user_turns} user turns"
        )

    @given(request=feedback_request_strategy)
    @settings(max_examples=100)
    def test_score_is_integer(self, request: FeedbackRequest):
        """Score must be an integer value."""
        feedback = build_feedback(request)
        assert isinstance(feedback.session_score, int), (
            f"session_score should be int, got {type(feedback.session_score)}"
        )
