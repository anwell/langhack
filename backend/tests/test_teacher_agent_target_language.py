"""Regression tests for target-language feedback examples."""

from app.teacher_agent import FeedbackRequest, TranscriptEntry, build_feedback


def _feedback_for(target_language: str):
    return build_feedback(
        FeedbackRequest(
            transcript=[TranscriptEntry(role="user", text="hello")],
            target_language=target_language,
            source_language="en",
        )
    )


def test_spanish_feedback_uses_spanish_examples():
    feedback = _feedback_for("es")

    assert feedback.corrections[0].original == "hello"
    assert feedback.corrections[0].corrected == "Hola, me gustaría pedir un café con leche, por favor."
    assert "(complete sentence in es)" not in feedback.corrections[0].corrected
    assert feedback.suggested_vocabulary[0].phrase == "¿Puede repetirlo más despacio?"
    assert feedback.suggested_vocabulary[1].phrase == "Me gustaría..."
    assert "Me gustaría..." in feedback.lesson_plan[0].practice_phrases


def test_french_feedback_uses_french_examples():
    feedback = _feedback_for("fr")

    assert feedback.corrections[0].corrected == "Bonjour, je voudrais commander un café au lait, s'il vous plaît."
    assert feedback.suggested_vocabulary[0].phrase == "Pouvez-vous répéter plus lentement ?"
    assert feedback.suggested_vocabulary[1].phrase == "Je voudrais..."
    assert "Je voudrais..." in feedback.lesson_plan[0].practice_phrases


def test_language_name_aliases_use_target_language_examples():
    feedback = _feedback_for("Spanish")

    assert feedback.corrections[0].corrected.startswith("Hola,")
    assert feedback.suggested_vocabulary[1].phrase == "Me gustaría..."


def test_whitespace_user_turn_still_returns_feedback():
    feedback = build_feedback(
        FeedbackRequest(
            transcript=[TranscriptEntry(role="user", text=" ")],
            target_language="es",
            source_language="en",
        )
    )

    assert feedback.session_score == 10
    assert feedback.corrections[0].original == "(no clear speech captured)"
    assert feedback.corrections[0].corrected.startswith("Hola,")
