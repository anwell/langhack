"""Property-based tests for pass/fail threshold consistency.

**Validates: Requirements 10.21**

Property 17: Pass/fail threshold consistency
- For any session_score, session_pass_fail is "pass" iff score >= 60
- For any session_score, session_pass_fail is "fail" iff score < 60
"""

from hypothesis import given, settings
from hypothesis import strategies as st

from app.teacher_agent import FeedbackRequest, TranscriptEntry, AvailableScenario, build_feedback

# Strategy for a valid transcript entry with role="user"
user_entry_strategy = st.builds(
    TranscriptEntry,
    role=st.just("user"),
    text=st.text(min_size=1, max_size=100),
    timestamp=st.none(),
)

# Strategy for a valid transcript entry with role="assistant"
assistant_entry_strategy = st.builds(
    TranscriptEntry,
    role=st.just("assistant"),
    text=st.text(min_size=1, max_size=100),
    timestamp=st.none(),
)

# Strategy for available scenarios
available_scenario_strategy = st.builds(
    AvailableScenario,
    id=st.text(min_size=1, max_size=20),
    title=st.text(min_size=1, max_size=50),
)

# Strategy for a valid FeedbackRequest with at least 1 user turn
# The number of user turns controls the score: score = min(user_turns * 10, 100)
feedback_request_strategy = st.builds(
    FeedbackRequest,
    transcript=st.integers(min_value=1, max_value=15).flatmap(
        lambda n: st.lists(
            st.one_of(user_entry_strategy, assistant_entry_strategy),
            min_size=n,
            max_size=n + 10,
        ).filter(
            lambda entries: any(e.role == "user" and e.text.strip() for e in entries)
        )
    ),
    target_language=st.sampled_from(["es", "fr", "de", "it", "pt", "ja"]),
    source_language=st.just("en"),
    available_scenarios=st.lists(available_scenario_strategy, min_size=0, max_size=3),
)


class TestPassFailThresholdConsistency:
    """Property 17: Pass/fail threshold consistency.

    For any valid FeedbackRequest, the session_pass_fail field must be:
    - "pass" when session_score >= 60
    - "fail" when session_score < 60
    """

    @given(request=feedback_request_strategy)
    @settings(max_examples=200)
    def test_pass_when_score_at_or_above_threshold(self, request):
        """session_pass_fail is 'pass' iff session_score >= 60."""
        feedback = build_feedback(request)

        if feedback.session_score >= 60:
            assert feedback.session_pass_fail == "pass", (
                f"Score {feedback.session_score} >= 60 should yield 'pass', "
                f"got '{feedback.session_pass_fail}'"
            )
        else:
            assert feedback.session_pass_fail == "fail", (
                f"Score {feedback.session_score} < 60 should yield 'fail', "
                f"got '{feedback.session_pass_fail}'"
            )

    @given(request=feedback_request_strategy)
    @settings(max_examples=200)
    def test_fail_when_score_below_threshold(self, request):
        """session_pass_fail is 'fail' iff session_score < 60."""
        feedback = build_feedback(request)

        if feedback.session_pass_fail == "fail":
            assert feedback.session_score < 60, (
                f"Pass/fail is 'fail' but score {feedback.session_score} >= 60"
            )
        else:
            assert feedback.session_score >= 60, (
                f"Pass/fail is 'pass' but score {feedback.session_score} < 60"
            )

    @given(
        num_user_turns=st.integers(min_value=1, max_value=5),
        target_language=st.sampled_from(["es", "fr", "de", "it", "pt", "ja"]),
    )
    @settings(max_examples=100)
    def test_below_threshold_scores_yield_fail(self, num_user_turns, target_language):
        """With fewer than 6 user turns, score < 60 and result is 'fail'."""
        # score = min(num_user_turns * 10, 100), so 1-5 turns → 10-50 → fail
        transcript = [
            TranscriptEntry(role="user", text=f"utterance {i}")
            for i in range(num_user_turns)
        ]
        request = FeedbackRequest(
            transcript=transcript,
            target_language=target_language,
        )
        feedback = build_feedback(request)

        assert feedback.session_score == num_user_turns * 10
        assert feedback.session_score < 60
        assert feedback.session_pass_fail == "fail"

    @given(
        num_user_turns=st.integers(min_value=6, max_value=15),
        target_language=st.sampled_from(["es", "fr", "de", "it", "pt", "ja"]),
    )
    @settings(max_examples=100)
    def test_at_or_above_threshold_scores_yield_pass(self, num_user_turns, target_language):
        """With 6 or more user turns, score >= 60 and result is 'pass'."""
        # score = min(num_user_turns * 10, 100), so 6+ turns → 60+ → pass
        transcript = [
            TranscriptEntry(role="user", text=f"utterance {i}")
            for i in range(num_user_turns)
        ]
        request = FeedbackRequest(
            transcript=transcript,
            target_language=target_language,
        )
        feedback = build_feedback(request)

        expected_score = min(num_user_turns * 10, 100)
        assert feedback.session_score == expected_score
        assert feedback.session_score >= 60
        assert feedback.session_pass_fail == "pass"

    @given(
        target_language=st.sampled_from(["es", "fr", "de", "it", "pt", "ja"]),
    )
    @settings(max_examples=50)
    def test_boundary_exactly_at_threshold(self, target_language):
        """With exactly 6 user turns, score is exactly 60 and result is 'pass'."""
        transcript = [
            TranscriptEntry(role="user", text=f"utterance {i}")
            for i in range(6)
        ]
        request = FeedbackRequest(
            transcript=transcript,
            target_language=target_language,
        )
        feedback = build_feedback(request)

        assert feedback.session_score == 60
        assert feedback.session_pass_fail == "pass"
