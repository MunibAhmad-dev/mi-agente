"""API dependencies — authentication, database, request state."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, Request

from brain.security.auth import verify_token
from brain.logging_config import get_logger

logger = get_logger("brain.api.deps")


@dataclass
class AuthContext:
    """Authenticated request context."""

    token_id: str
    name: str
    scopes: list[str]


async def get_auth_context(
    authorization: str | None = Header(default=None),
) -> AuthContext | None:
    """Extract and verify bearer token. Returns None if no auth header (allows unauthenticated health checks)."""
    if not authorization:
        return None

    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header format")

    token = authorization[7:]

    try:
        result = await verify_token(token)
        return AuthContext(
            token_id=result["id"],
            name=result["name"],
            scopes=result["scopes"],
        )
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))


async def require_auth(
    auth: AuthContext | None = Depends(get_auth_context),
) -> AuthContext:
    """Require a valid auth token. Used for protected endpoints."""
    if auth is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return auth


def require_scope(scope: str):
    """Dependency factory that checks for a specific scope."""

    async def _check(auth: AuthContext = Depends(require_auth)) -> AuthContext:
        if scope not in auth.scopes:
            raise HTTPException(status_code=403, detail=f"Missing required scope: {scope}")
        return auth

    return _check
