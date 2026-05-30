"""Property-based tests for Session Report completeness.

**Validates: Requirements 8.1, 8.2**

Property 19: Session Report completeness
- Test that _format_session_report() output contains all required fields:
  transcript entries, session_score, session_pass_fail, performance_highlights,
  corrections, suggested_vocabulary, and lesson_plan
"""

from hypothesis import given, settings
from hypothesis import strategies as st

from app.box_upload import TranscriptEntry, TranscriptUploadRequest, _format_session_report


# --- Strategies ---

transcript_entry_strategy = st.builds(
    TranscriptEntry,
    role=st.sampled_from(["user", "assistant"]),
    text=st.text(min_size=1, max_size=200),
    timestamp=st.one_of(st.none(), st.text(min_size=1, max_size=30)),
)

correction_strategy = st.fixed_dictionaries(
    {
        "original": st.text(min_size=1, max_size=100),
        "corrected": st.text(min_size=1, max_size=100),
        "explanation": st.text(min_size=1, max_size=200),
    }
)

vocabulary_item_strategy = st.fixed_dictionaries(
    {
        "phrase": st.text(min_size=1, max_size=100),
        "translation": st.text(min_size=1, max_size=100),
    }
)

lesson_plan_item_strategy = st.fixed_dictionaries(
    {
        "focus_area": st.text(min_size=1, max_size=100),
        "practice_phrases": st.lists(st.text(min_size=1, max_size=100), min_size=1, max_size=5),
    }
)

feedback_strategy = st.fixed_dictionaries(
    {
        "session_score": st.integers(min_value=0, max_value=100),
        "session_pass_fail": st.sampled_from(["pass", "fail"]),
        "performance_highlights": st.lists(st.text(min_size=1, max_size=200), min_size=1, max_size=5),
        "areas_for_improvement": st.lists(st.text(min_size=1, max_size=200), min_size=1, max_size=5),
        "corrections": st.lists(correction_strategy, min_size=1, max_size=5),
        "suggested_vocabulary": st.lists(vocabulary_item_strategy, min_size=1, max_size=5),
        "lesson_plan": st.lists(lesson_plan_item_strategy, min_size=1, max_size=5),
    }
)

upload_request_with_feedback_strategy = st.builds(
    TranscriptUploadRequest,
    transcript=st.lists(transcript_entry_strategy, min_size=1, max_size=10),
    session_date=st.text(min_size=1, max_size=30),
    scenario_title=st.text(min_size=1, max_size=100),
    feedback=feedback_strategy,
)


class TestSessionReportContainsTranscript:
    """Property: Session report output contains all transcript entries."""

    @given(request=upload_request_with_feedback_strategy)
    @settings(max_examples=100)
    def test_all_transcript_entries_present(self, request: TranscriptUploadRequest):
        report = _format_session_report(request).decode("utf-8")

        for entry in request.transcript:
            assert entry.text in report, (
                f"Transcript entry text '{entry.text}' not found in report"
            )


class TestSessionReportContainsScore:
    """Property: Session report output contains session_score."""

    @given(request=upload_request_with_feedback_strategy)
    @settings(max_examples=100)
    def test_session_score_present(self, request: TranscriptUploadRequest):
        report = _format_session_report(request).decode("utf-8")
        score = request.feedback["session_score"]

        assert f"{score}/100" in report, (
            f"Session score '{score}/100' not found in report"
        )


class TestSessionReportContainsPassFail:
    """Property: Session report output contains session_pass_fail."""

    @given(request=upload_request_with_feedback_strategy)
    @settings(max_examples=100)
    def test_session_pass_fail_present(self, request: TranscriptUploadRequest):
        report = _format_session_report(request).decode("utf-8")
        pass_fail = request.feedback["session_pass_fail"]

        assert pass_fail.upper() in report, (
            f"Session pass/fail '{pass_fail.upper()}' not found in report"
        )


class TestSessionReportContainsPerformanceHighlights:
    """Property: Session report output contains performance_highlights section."""

    @given(request=upload_request_with_feedback_strategy)
    @settings(max_examples=100)
    def test_performance_highlights_present(self, request: TranscriptUploadRequest):
        report = _format_session_report(request).decode("utf-8")

        assert "PERFORMANCE HIGHLIGHTS" in report, (
            "Performance highlights section header not found in report"
        )
        for highlight in request.feedback["performance_highlights"]:
            assert highlight in report, (
                f"Performance highlight '{highlight}' not found in report"
            )


class TestSessionReportContainsCorrections:
    """Property: Session report output contains corrections section."""

    @given(request=upload_request_with_feedback_strategy)
    @settings(max_examples=100)
    def test_corrections_present(self, request: TranscriptUploadRequest):
        report = _format_session_report(request).decode("utf-8")

        assert "CORRECTIONS" in report, (
            "Corrections section header not found in report"
        )
        for correction in request.feedback["corrections"]:
            assert correction["original"] in report, (
                f"Correction original '{correction['original']}' not found in report"
            )
            assert correction["corrected"] in report, (
                f"Correction corrected '{correction['corrected']}' not found in report"
            )


class TestSessionReportContainsSuggestedVocabulary:
    """Property: Session report output contains suggested_vocabulary section."""

    @given(request=upload_request_with_feedback_strategy)
    @settings(max_examples=100)
    def test_suggested_vocabulary_present(self, request: TranscriptUploadRequest):
        report = _format_session_report(request).decode("utf-8")

        assert "SUGGESTED VOCABULARY" in report, (
            "Suggested vocabulary section header not found in report"
        )
        for item in request.feedback["suggested_vocabulary"]:
            assert item["phrase"] in report, (
                f"Vocabulary phrase '{item['phrase']}' not found in report"
            )
            assert item["translation"] in report, (
                f"Vocabulary translation '{item['translation']}' not found in report"
            )


class TestSessionReportContainsLessonPlan:
    """Property: Session report output contains lesson_plan section."""

    @given(request=upload_request_with_feedback_strategy)
    @settings(max_examples=100)
    def test_lesson_plan_present(self, request: TranscriptUploadRequest):
        report = _format_session_report(request).decode("utf-8")

        assert "LESSON PLAN" in report, (
            "Lesson plan section header not found in report"
        )
        for item in request.feedback["lesson_plan"]:
            assert item["focus_area"] in report, (
                f"Lesson plan focus area '{item['focus_area']}' not found in report"
            )
            for phrase in item["practice_phrases"]:
                assert phrase in report, (
                    f"Lesson plan practice phrase '{phrase}' not found in report"
                )
