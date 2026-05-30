"""Teacher Agent feedback endpoint."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

router = APIRouter(tags=["feedback"])


class TranscriptEntry(BaseModel):
    role: str
    text: str
    timestamp: str | None = None

    @field_validator("role")
    @classmethod
    def role_must_be_known(cls, value: str) -> str:
        if value not in {"user", "assistant"}:
            raise ValueError("role must be user or assistant")
        return value


class AvailableScenario(BaseModel):
    id: str
    title: str


class Correction(BaseModel):
    original: str
    corrected: str
    explanation: str | None = None


class SuggestedPhrase(BaseModel):
    phrase: str
    translation: str
    context: str


class SuggestedScenario(BaseModel):
    id: str | None = None
    title: str
    description: str
    rationale: str


class LessonPlanItem(BaseModel):
    focus_area: str
    practice_phrases: list[str] = Field(default_factory=list, max_length=5)


class SessionFeedback(BaseModel):
    session_score: int = Field(ge=0, le=100)
    session_pass_fail: Literal["pass", "fail"]
    performance_highlights: list[str]
    areas_for_improvement: list[str]
    corrections: list[Correction]
    suggested_vocabulary: list[SuggestedPhrase]
    suggested_scenarios: list[SuggestedScenario] = Field(min_length=1, max_length=3)
    lesson_plan: list[LessonPlanItem] = Field(min_length=1, max_length=5)


class FeedbackRequest(BaseModel):
    transcript: list[TranscriptEntry]
    target_language: str
    source_language: str = "en"
    available_scenarios: list[AvailableScenario] = Field(default_factory=list)


class FeedbackResponse(BaseModel):
    success: bool
    feedback: SessionFeedback | None = None
    session_score: int | None = None
    session_pass_fail: Literal["pass", "fail"] | None = None
    error: str | None = None


def _transcript_text(transcript: list[TranscriptEntry]) -> str:
    return "\n".join(f"{entry.role}: {entry.text}" for entry in transcript if entry.text.strip())


def build_feedback(request: FeedbackRequest) -> SessionFeedback:
    """Build structured feedback from transcript text.

    This deterministic evaluator is intentionally conservative; it provides the
    same schema a future Bedrock/Strands Teacher Agent call should return.
    """
    text = _transcript_text(request.transcript)
    user_turns = [entry.text for entry in request.transcript if entry.role == "user" and entry.text.strip()]
    if not user_turns:
        raise ValueError("Transcript must include at least one user utterance")

    # Deterministic placeholder scoring: count user turns × 10, capped at 100
    session_score = min(len(user_turns) * 10, 100)
    session_pass_fail: Literal["pass", "fail"] = "pass" if session_score >= 60 else "fail"

    scenario = request.available_scenarios[0] if request.available_scenarios else None
    suggested = SuggestedScenario(
        id=scenario.id if scenario else None,
        title=scenario.title if scenario else "Repeat the same situation with more details",
        description=(
            "Practice the same communication goal again, adding follow-up questions and fuller answers."
        ),
        rationale="This directly reinforces the conversational gaps from the latest session.",
    )

    shortest = min(user_turns, key=len)
    return SessionFeedback(
        session_score=session_score,
        session_pass_fail=session_pass_fail,
        performance_highlights=[
            "You completed multiple turns in the target conversation.",
            "You responded to the partner instead of relying only on isolated words.",
        ],
        areas_for_improvement=[
            "Expand short answers into complete sentences.",
            "Add more situation-specific vocabulary before moving to the next turn.",
            "Listen for the assistant's corrected phrasing and reuse it in your next reply.",
        ],
        corrections=[
            Correction(
                original=shortest,
                corrected=f"{shortest} ... (complete sentence in {request.target_language})",
                explanation="Turn fragments into a full sentence with a subject, verb, and relevant detail.",
            )
        ],
        suggested_vocabulary=[
            SuggestedPhrase(
                phrase="Could you repeat that more slowly?",
                translation="Use the equivalent phrase in your target language.",
                context="Ask for clarification while staying in the conversation.",
            ),
            SuggestedPhrase(
                phrase="I would like...",
                translation="Use the equivalent polite request in your target language.",
                context="Make requests naturally in service encounters.",
            ),
        ],
        suggested_scenarios=[suggested],
        lesson_plan=[
            LessonPlanItem(
                focus_area="Longer answers",
                practice_phrases=[
                    "I would like...",
                    "Could you help me with...?",
                    "I prefer... because...",
                ],
            ),
            LessonPlanItem(
                focus_area="Clarification strategies",
                practice_phrases=[
                    "Could you repeat that?",
                    "What does that mean?",
                    "Please speak more slowly.",
                ],
            ),
        ],
    )


@router.post("/feedback", response_model=FeedbackResponse)
async def create_feedback(request: FeedbackRequest) -> FeedbackResponse:
    """Evaluate a completed session transcript and return structured feedback."""
    try:
        feedback = build_feedback(request)
        return FeedbackResponse(
            success=True,
            feedback=feedback,
            session_score=feedback.session_score,
            session_pass_fail=feedback.session_pass_fail,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        return FeedbackResponse(success=False, error=str(exc))
