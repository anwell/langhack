"""Conversation tools for the BidiAgent voice session.

These tools are available to the BidiAgent during real-time voice conversations.
They allow the AI to provide vocabulary help and signal session completion.
"""

from strands import tool
from strands.experimental.bidi.tools import stop_conversation

__all__ = ["get_vocabulary_hint", "signal_session_complete", "signal_outcome_achieved", "stop_conversation"]


@tool
def get_vocabulary_hint(word_or_phrase: str, target_language: str) -> str:
    """Provide a vocabulary hint or translation for a word or phrase.

    Use this when the learner is struggling with a word or asks for help
    with vocabulary during the conversation.

    Args:
        word_or_phrase: The word or phrase to explain
        target_language: The language being practiced (ISO 639-1 code)
    """
    return f"Vocabulary hint requested for '{word_or_phrase}' in {target_language}"


@tool
def signal_session_complete(reason: str) -> str:
    """Signal that the conversation scenario has reached a natural conclusion.

    Use this when the role-play scenario has been completed successfully
    (e.g., the restaurant order is placed, directions have been given).

    Args:
        reason: Brief description of why the scenario is complete
    """
    return f"Session complete: {reason}"


@tool
def signal_outcome_achieved(reason: str) -> str:
    """Signal that the learner has achieved the intended outcome of the scenario.

    Use this when the learner has clearly demonstrated they can accomplish the
    scenario's goal through the conversation. This ends the session as a pass.

    Args:
        reason: Brief description of how the learner achieved the outcome
    """
    return f"Outcome achieved: {reason}"
