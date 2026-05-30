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


TARGET_LANGUAGE_EXAMPLES = {
    "es": {
        "correction": "Hola, me gustaría pedir un café con leche, por favor.",
        "vocabulary": [
            ("¿Puede repetirlo más despacio?", "Could you repeat that more slowly?"),
            ("Me gustaría...", "I would like..."),
        ],
        "lesson_plan": [
            ("Respuestas más completas", ["Me gustaría...", "¿Puede ayudarme con...?", "Prefiero... porque..."]),
            ("Estrategias de aclaración", ["¿Puede repetirlo?", "¿Qué significa eso?", "Por favor, hable más despacio."]),
        ],
    },
    "fr": {
        "correction": "Bonjour, je voudrais commander un café au lait, s'il vous plaît.",
        "vocabulary": [
            ("Pouvez-vous répéter plus lentement ?", "Could you repeat that more slowly?"),
            ("Je voudrais...", "I would like..."),
        ],
        "lesson_plan": [
            ("Réponses plus complètes", ["Je voudrais...", "Pouvez-vous m'aider avec... ?", "Je préfère... parce que..."]),
            ("Stratégies de clarification", ["Pouvez-vous répéter ?", "Qu'est-ce que cela veut dire ?", "Parlez plus lentement, s'il vous plaît."]),
        ],
    },
    "de": {
        "correction": "Hallo, ich möchte bitte einen Kaffee mit Milch bestellen.",
        "vocabulary": [
            ("Können Sie das bitte langsamer wiederholen?", "Could you repeat that more slowly?"),
            ("Ich möchte...", "I would like..."),
        ],
        "lesson_plan": [
            ("Längere Antworten", ["Ich möchte...", "Können Sie mir mit... helfen?", "Ich bevorzuge... weil..."]),
            ("Klärungsstrategien", ["Können Sie das wiederholen?", "Was bedeutet das?", "Bitte sprechen Sie langsamer."]),
        ],
    },
    "it": {
        "correction": "Ciao, vorrei ordinare un caffè con latte, per favore.",
        "vocabulary": [
            ("Può ripetere più lentamente?", "Could you repeat that more slowly?"),
            ("Vorrei...", "I would like..."),
        ],
        "lesson_plan": [
            ("Risposte più complete", ["Vorrei...", "Può aiutarmi con...?", "Preferisco... perché..."]),
            ("Strategie di chiarimento", ["Può ripetere?", "Che cosa significa?", "Parli più lentamente, per favore."]),
        ],
    },
    "pt": {
        "correction": "Olá, eu gostaria de pedir um café com leite, por favor.",
        "vocabulary": [
            ("Você pode repetir mais devagar?", "Could you repeat that more slowly?"),
            ("Eu gostaria de...", "I would like..."),
        ],
        "lesson_plan": [
            ("Respostas mais completas", ["Eu gostaria de...", "Você pode me ajudar com...?", "Eu prefiro... porque..."]),
            ("Estratégias de esclarecimento", ["Você pode repetir?", "O que isso significa?", "Por favor, fale mais devagar."]),
        ],
    },
    "ja": {
        "correction": "こんにちは、カフェラテを注文したいです。",
        "vocabulary": [
            ("もう少しゆっくり繰り返してもらえますか。", "Could you repeat that more slowly?"),
            ("...をお願いします。", "I would like..."),
        ],
        "lesson_plan": [
            ("より長い答え", ["...をお願いします。", "...を手伝ってもらえますか。", "...のほうが好きです。なぜなら..."]),
            ("確認の表現", ["もう一度お願いします。", "それはどういう意味ですか。", "もっとゆっくり話してください。"]),
        ],
    },
    "ko": {
        "correction": "안녕하세요, 카페라테를 주문하고 싶어요.",
        "vocabulary": [
            ("좀 더 천천히 다시 말씀해 주시겠어요?", "Could you repeat that more slowly?"),
            ("...을/를 원해요.", "I would like..."),
        ],
        "lesson_plan": [
            ("더 긴 대답", ["...을/를 원해요.", "...을/를 도와주실 수 있나요?", "저는 ...을/를 더 좋아해요. 왜냐하면..."]),
            ("확인 표현", ["다시 말씀해 주시겠어요?", "그게 무슨 뜻인가요?", "더 천천히 말씀해 주세요."]),
        ],
    },
    "zh": {
        "correction": "你好，我想点一杯拿铁，谢谢。",
        "vocabulary": [
            ("你可以说慢一点吗？", "Could you repeat that more slowly?"),
            ("我想要...", "I would like..."),
        ],
        "lesson_plan": [
            ("更完整的回答", ["我想要...", "你可以帮我...吗？", "我更喜欢...，因为..."]),
            ("澄清策略", ["你可以重复一遍吗？", "这是什么意思？", "请说慢一点。"]),
        ],
    },
}

TARGET_LANGUAGE_ALIASES = {
    "spanish": "es",
    "french": "fr",
    "german": "de",
    "italian": "it",
    "portuguese": "pt",
    "japanese": "ja",
    "korean": "ko",
    "chinese": "zh",
    "mandarin": "zh",
}


def _target_language_key(target_language: str) -> str:
    normalized = target_language.strip().lower()
    return TARGET_LANGUAGE_ALIASES.get(normalized, normalized)


def _target_language_examples(target_language: str) -> dict:
    key = _target_language_key(target_language)
    return TARGET_LANGUAGE_EXAMPLES.get(
        key,
        {
            "correction": f"Write a complete sentence in {target_language} that matches your intent.",
            "vocabulary": [
                (f"Target-language equivalent of: Could you repeat that more slowly?", "Could you repeat that more slowly?"),
                (f"Target-language equivalent of: I would like...", "I would like..."),
            ],
            "lesson_plan": [
                ("Longer answers", [f"Full request sentence in {target_language}", f"Clarifying question in {target_language}"]),
                ("Clarification strategies", [f"Ask someone to repeat in {target_language}", f"Ask someone to speak more slowly in {target_language}"]),
            ],
        },
    )


def _transcript_text(transcript: list[TranscriptEntry]) -> str:
    return "\n".join(f"{entry.role}: {entry.text}" for entry in transcript if entry.text.strip())


def build_feedback(request: FeedbackRequest) -> SessionFeedback:
    """Build structured feedback from transcript text.

    This deterministic evaluator is intentionally conservative; it provides the
    same schema a future Bedrock/Strands Teacher Agent call should return.
    """
    user_entries = [entry for entry in request.transcript if entry.role == "user"]
    user_turns = [entry.text.strip() for entry in user_entries if entry.text.strip()]
    if not user_turns and user_entries:
        user_turns = ["(no clear speech captured)"]
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
    examples = _target_language_examples(request.target_language)
    vocabulary = examples["vocabulary"]
    lesson_plan = examples["lesson_plan"]
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
                corrected=examples["correction"],
                explanation="Turn fragments into a full sentence with a subject, verb, and relevant detail.",
            )
        ],
        suggested_vocabulary=[
            SuggestedPhrase(
                phrase=vocabulary[0][0],
                translation=vocabulary[0][1],
                context="Ask for clarification while staying in the conversation.",
            ),
            SuggestedPhrase(
                phrase=vocabulary[1][0],
                translation=vocabulary[1][1],
                context="Make requests naturally in service encounters.",
            ),
        ],
        suggested_scenarios=[suggested],
        lesson_plan=[
            LessonPlanItem(
                focus_area=lesson_plan[0][0],
                practice_phrases=lesson_plan[0][1],
            ),
            LessonPlanItem(
                focus_area=lesson_plan[1][0],
                practice_phrases=lesson_plan[1][1],
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
