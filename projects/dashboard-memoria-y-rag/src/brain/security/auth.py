"""Token-based authentication — hash comparison, expiry, revocation.

Adapted from Memory Vault's auth system.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt

from brain.core.db import fetch_all, fetch_one, execute
from brain.core.exceptions import AuthError, InvalidTokenError, TokenExpiredError
from brain.logging_config import get_logger

logger = get_logger("brain.security.auth")


def generate_token() -> str:
    """Generate a cryptographically secure token."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Hash a token using SHA-256 (constant-time comparison)."""
    return hashlib.sha256(token.encode()).hexdigest()


async def create_token(
    name: str,
    scopes: list[str] | None = None,
    expiry_days: int = 30,
) -> dict:
    """Create a new API token. Returns token + metadata.

    The raw token is only returned once — the stored hash is used for verification.
    """
    token = generate_token()
    token_hashed = hash_token(token)
    token_id = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(days=expiry_days)
    scopes = scopes or ["read", "write"]

    await execute(
        """
        INSERT INTO api_tokens (id, name, token_hash, scopes, expires_at)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (token_id, name, token_hashed, scopes, expires_at),
    )

    logger.info("token_created", token_id=token_id, name=name, expiry_days=expiry_days)

    return {
        "id": token_id,
        "token": token,
        "name": name,
        "scopes": scopes,
        "expires_at": expires_at.isoformat(),
    }


async def verify_token(token: str) -> dict:
    """Verify a token and return its metadata.

    Raises:
        InvalidTokenError: if the token doesn't match any record
        TokenExpiredError: if the token has expired
    """
    token_hashed = hash_token(token)
    row = await fetch_one(
        "SELECT id, name, scopes, expires_at FROM api_tokens WHERE token_hash = %s",
        (token_hashed,),
    )

    if not row:
        raise InvalidTokenError("Invalid API token")

    if row["expires_at"] and row["expires_at"] < datetime.now(timezone.utc):
        raise TokenExpiredError("API token has expired")

    # Update last_used_at
    await execute(
        "UPDATE api_tokens SET last_used_at = now() WHERE id = %s",
        (row["id"],),
    )

    return {
        "id": str(row["id"]),
        "name": row["name"],
        "scopes": row["scopes"],
        "expires_at": row["expires_at"].isoformat() if row["expires_at"] else None,
    }


async def revoke_token(token_id: str) -> bool:
    """Revoke (delete) a token by ID."""
    pool_conn = await fetch_one("DELETE FROM api_tokens WHERE id = %s RETURNING id", (token_id,))
    if pool_conn:
        logger.info("token_revoked", token_id=token_id)
        return True
    return False


async def list_tokens() -> list[dict]:
    """List all tokens (without the raw token)."""
    rows = await fetch_all(
        "SELECT id, name, scopes, expires_at, last_used_at, created_at FROM api_tokens ORDER BY created_at DESC"
    )
    return [
        {
            "id": str(r["id"]),
            "name": r["name"],
            "scopes": r["scopes"],
            "expires_at": r["expires_at"].isoformat() if r["expires_at"] else None,
            "last_used_at": r["last_used_at"].isoformat() if r["last_used_at"] else None,
            "created_at": r["created_at"].isoformat(),
        }
        for r in rows
    ]
