"""Tests for Box upload error formatting."""

from io import BytesIO
from urllib.error import HTTPError

from app.box_upload import _box_error_message


def _http_error(code: int, reason: str, body: bytes) -> HTTPError:
    return HTTPError(
        url="https://upload.box.com/api/2.0/files/content",
        code=code,
        msg=reason,
        hdrs={},
        fp=BytesIO(body),
    )


def test_empty_unauthorized_box_error_mentions_expired_token():
    message = _box_error_message(_http_error(401, "Unauthorized", b""))

    assert message == (
        "Box upload failed (401 Unauthorized): Box developer token is invalid or expired."
    )


def test_box_json_error_uses_message_field():
    message = _box_error_message(
        _http_error(409, "Conflict", b'{"message":"Item with the same name already exists"}')
    )

    assert message == (
        "Box upload failed (409 Conflict): Item with the same name already exists"
    )
