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


class TranscriptUploadResponse(BaseModel):
    success: bool
    box_file_url: str | None = None
    error: str | None = None


def _safe_filename(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-")
    return cleaned[:80] or "transcript"


def _format_transcript(request: TranscriptUploadRequest) -> bytes:
    lines = [
        f"Scenario: {request.scenario_title}",
        f"Session date: {request.session_date}",
        f"Uploaded at: {datetime.now(UTC).isoformat()}",
        "",
    ]
    for entry in request.transcript:
        prefix = "Learner" if entry.role == "user" else "Assistant"
        timestamp = f" [{entry.timestamp}]" if entry.timestamp else ""
        lines.append(f"{prefix}{timestamp}: {entry.text}")
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


@router.post("/upload", response_model=TranscriptUploadResponse)
async def upload_transcript(request: TranscriptUploadRequest) -> TranscriptUploadResponse:
    """Upload a transcript text file to the configured Box folder."""
    settings = get_settings()
    if not settings.box_developer_token or not settings.box_folder_id:
        raise HTTPException(status_code=503, detail="Box credentials are not configured")

    filename = f"{_safe_filename(request.session_date)}-{_safe_filename(request.scenario_title)}.txt"
    boundary = f"----langhack-{datetime.now(UTC).timestamp()}"
    body = _multipart_body(filename, settings.box_folder_id, _format_transcript(request), boundary)
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
        detail = exc.read().decode("utf-8", errors="replace")
        return TranscriptUploadResponse(success=False, error=f"Box upload failed: {detail}")
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
