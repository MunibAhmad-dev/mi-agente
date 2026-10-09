"""Security primitives (Master Prompt §64) — stdlib only, no external deps.

- Password hashing: PBKDF2-HMAC-SHA256 with per-user salt (200k iterations).
- Tokens: HMAC-SHA256-signed (header.payload.signature), with expiry.
- Secret: loaded from a file, or generated and persisted with 0600 permissions.

GPU note: nothing here touches hardware; the system is CPU-only by decision
(2026-09-07), see config.py.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from pathlib import Path

PBKDF2_ITERATIONS = 200_000
TOKEN_TTL_SECONDS = 7 * 24 * 3600


# ---------------------------------------------------------------- passwords

def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, iterations, salt_hex, digest_hex = stored.split("$")
        if scheme != "pbkdf2":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations)
        )
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


# ------------------------------------------------------------------ tokens

def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def sign_token(payload: dict, secret: str, ttl_seconds: int = TOKEN_TTL_SECONDS) -> str:
    body = {"sub": payload["sub"], "role": payload.get("role"), "exp": int(time.time()) + ttl_seconds}
    header = _b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode("utf-8"))
    payload_b64 = _b64encode(json.dumps(body, separators=(",", ":")).encode("utf-8"))
    signature = _b64encode(hmac.new(secret.encode("utf-8"), f"{header}.{payload_b64}".encode("utf-8"), hashlib.sha256).digest())
    return f"{header}.{payload_b64}.{signature}"


def decode_token(token: str, secret: str) -> dict | None:
    try:
        header_b64, payload_b64, signature_b64 = token.split(".")
        expected = hmac.new(
            secret.encode("utf-8"), f"{header_b64}.{payload_b64}".encode("utf-8"), hashlib.sha256
        ).digest()
        if not hmac.compare_digest(expected, _b64decode(signature_b64)):
            return None
        payload = json.loads(_b64decode(payload_b64))
        if int(payload.get("exp", 0)) < int(time.time()):
            return None
        return payload
    except (ValueError, TypeError, json.JSONDecodeError, UnicodeDecodeError):
        return None


# ------------------------------------------------------------------ secrets

# ------------------------------------------------------------ rate limiting


class RateLimiter:
    """Fixed-window limiter (audit item: login brute-force).

    In-memory by design — the kernel is a single process; if multi-process
    deployment arrives, move to the DB or a token-bucket table.
    """

    def __init__(self, max_events: int, window_seconds: float) -> None:
        self.max_events = max_events
        self.window = window_seconds
        self._events: dict[str, list[float]] = {}

    def check(self, key: str) -> bool:
        """Record one event for `key`; return True if within the limit."""
        now = time.monotonic()
        recent = [t for t in self._events.get(key, []) if now - t < self.window]
        if len(recent) >= self.max_events:
            self._events[key] = recent
            return False
        recent.append(now)
        self._events[key] = recent
        return True

    def retry_after(self, key: str) -> int:
        events = self._events.get(key, [])
        if not events:
            return 0
        elapsed = time.monotonic() - events[0]
        return max(1, int(self.window - elapsed))


def get_or_create_secret(path: Path) -> str:
    """Load the signing secret from disk or generate + persist it (0600)."""
    path = Path(path)
    if path.exists():
        value = path.read_text(encoding="utf-8").strip()
        if value:
            return value
    value = secrets.token_hex(32)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(value + "\n")
    return value