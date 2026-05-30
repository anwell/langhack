"""Box.com transcript upload endpoint."""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import get_settings

router = APIRouter(prefix="/transcripts", tags=["transcripts"])


class TranscriptEntry(BaseModel):
    role: str
    text: str
    timestamp: str | None = None


class TranscriptUploadRequest(BaseModel):
    transcript: list[TranscriptEntry]
    session_date: str
    scenario_title: str
    feedback: dict | None = None


class TranscriptUploadResponse(BaseModel):
    success: bool
    box_file_url: str | None = None
    error: str | None = None


def _safe_filename(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-")
    return cleaned[:80] or "transcript"


def _format_session_report(request: TranscriptUploadRequest) -> bytes:
    lines = [
        "=" * 60,
        "SESSION REPORT",
        "=" * 60,
        "",
        f"Scenario: {request.scenario_title}",
        f"Session date: {request.session_date}",
        f"Uploaded at: {datetime.now(UTC).isoformat()}",
    ]

    # Score and pass/fail if feedback is available
    if request.feedback:
        score = request.feedback.get("session_score")
        pass_fail = request.feedback.get("session_pass_fail")
        if score is not None:
            lines.append(f"Score: {score}/100")
        if pass_fail is not None:
            lines.append(f"Result: {pass_fail.upper()}")

    lines.append("")
    lines.append("-" * 60)
    lines.append("TRANSCRIPT")
    lines.append("-" * 60)
    lines.append("")

    for entry in request.transcript:
        prefix = "Learner" if entry.role == "user" else "Assistant"
        timestamp = f" [{entry.timestamp}]" if entry.timestamp else ""
        lines.append(f"{prefix}{timestamp}: {entry.text}")

    # Feedback sections
    if request.feedback:
        # Performance highlights
        highlights = request.feedback.get("performance_highlights")
        if highlights:
            lines.append("")
            lines.append("-" * 60)
            lines.append("PERFORMANCE HIGHLIGHTS")
            lines.append("-" * 60)
            lines.append("")
            if isinstance(highlights, list):
                for item in highlights:
                    lines.append(f"  • {item}")
            else:
                lines.append(f"  {highlights}")

        # Areas for improvement
        improvements = request.feedback.get("areas_for_improvement")
        if improvements:
            lines.append("")
            lines.append("-" * 60)
            lines.append("AREAS FOR IMPROVEMENT")
            lines.append("-" * 60)
            lines.append("")
            if isinstance(improvements, list):
                for item in improvements:
                    lines.append(f"  • {item}")
            else:
                lines.append(f"  {improvements}")

        # Corrections
        corrections = request.feedback.get("corrections")
        if corrections:
            lines.append("")
            lines.append("-" * 60)
            lines.append("CORRECTIONS")
            lines.append("-" * 60)
            lines.append("")
            if isinstance(corrections, list):
                for correction in corrections:
                    if isinstance(correction, dict):
                        original = correction.get("original", "")
                        corrected = correction.get("corrected", "")
                        explanation = correction.get("explanation", "")
                        lines.append(f"  ✗ {original}")
                        lines.append(f"  ✓ {corrected}")
                        if explanation:
                            lines.append(f"    ({explanation})")
                        lines.append("")
                    else:
                        lines.append(f"  • {correction}")

        # Suggested vocabulary
        vocabulary = request.feedback.get("suggested_vocabulary")
        if vocabulary:
            lines.append("")
            lines.append("-" * 60)
            lines.append("SUGGESTED VOCABULARY")
            lines.append("-" * 60)
            lines.append("")
            if isinstance(vocabulary, list):
                for item in vocabulary:
                    if isinstance(item, dict):
                        phrase = item.get("phrase", "")
                        translation = item.get("translation", "")
                        lines.append(f"  • {phrase} — {translation}")
                    else:
                        lines.append(f"  • {item}")
            else:
                lines.append(f"  {vocabulary}")

        # Lesson plan
        lesson_plan = request.feedback.get("lesson_plan")
        if lesson_plan:
            lines.append("")
            lines.append("-" * 60)
            lines.append("LESSON PLAN")
            lines.append("-" * 60)
            lines.append("")
            if isinstance(lesson_plan, list):
                for i, item in enumerate(lesson_plan, 1):
                    if isinstance(item, dict):
                        focus = item.get("focus_area", "")
                        lines.append(f"  {i}. {focus}")
                        phrases = item.get("practice_phrases", [])
                        for phrase in phrases:
                            lines.append(f"     - {phrase}")
                    else:
                        lines.append(f"  {i}. {item}")
            else:
                lines.append(f"  {lesson_plan}")

    lines.append("")
    lines.append("=" * 60)
    return "\n".join(lines).encode("utf-8")


def _multipart_body(filename: str, folder_id: str, content: bytes, boundary: str) -> bytes:
    attrs = json.dumps({"name": filename, "parent": {"id": folder_id}})
    parts = [
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"attributes\"\r\n"
        "Content-Type: application/json\r\n\r\n"
        f"{attrs}\r\n".encode(),
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\n"
        "Content-Type: text/plain\r\n\r\n".encode(),
        content,
        f"\r\n--{boundary}--\r\n".encode(),
    ]
    return b"".join(parts)


def _box_error_message(exc: urllib.error.HTTPError) -> str:
    """Return an actionable Box upload error from an HTTPError response."""
    detail = exc.read().decode("utf-8", errors="replace").strip()
    reason = getattr(exc, "reason", "") or "HTTP error"
    status = f"{exc.code} {reason}".strip()

    if detail:
        try:
            payload = json.loads(detail)
        except json.JSONDecodeError:
            parsed_detail = detail
        else:
            parsed_detail = (
                payload.get("message")
                or payload.get("error_description")
                or payload.get("error")
                or detail
            )
    elif exc.code == 401:
        parsed_detail = "Box developer token is invalid or expired."
    elif exc.code == 403:
        parsed_detail = "Box token does not have access to the configured folder."
    elif exc.code == 404:
        parsed_detail = "Configured Box folder was not found."
    elif exc.code == 409:
        parsed_detail = "A transcript with this filename already exists in the Box folder."
    else:
        parsed_detail = "Box returned an empty error response."

    return f"Box upload failed ({status}): {parsed_detail}"


@router.post("/upload", response_model=TranscriptUploadResponse)
async def upload_transcript(request: TranscriptUploadRequest) -> TranscriptUploadResponse:
    """Upload a transcript text file to the configured Box folder."""
    settings = get_settings()
    if not settings.box_developer_token or not settings.box_folder_id:
        raise HTTPException(status_code=503, detail="Box credentials are not configured")

    filename = f"{_safe_filename(request.session_date)}-{_safe_filename(request.scenario_title)}.txt"
    boundary = f"----langhack-{datetime.now(UTC).timestamp()}"
    body = _multipart_body(filename, settings.box_folder_id, _format_session_report(request), boundary)
    upload_request = urllib.request.Request(
        "https://upload.box.com/api/2.0/files/content",
        data=body,
        headers={
            "Authorization": f"Bearer {settings.box_developer_token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(upload_request, timeout=30) as response:  # noqa: S310 - fixed Box API URL
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return TranscriptUploadResponse(success=False, error=_box_error_message(exc))
    except Exception as exc:
        return TranscriptUploadResponse(success=False, error=str(exc))

    entries = payload.get("entries", [])
    file_id = entries[0].get("id") if entries else None
    if not file_id:
        return TranscriptUploadResponse(success=False, error="Box response did not include a file id")

    return TranscriptUploadResponse(
        success=True,
        box_file_url=f"https://app.box.com/file/{file_id}",
    )
