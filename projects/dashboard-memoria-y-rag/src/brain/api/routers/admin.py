"""Admin API router — token management, system stats."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from brain.api.schemas import TokenCreateRequest, TokenResponse
from brain.security.auth import create_token, list_tokens, revoke_token
from brain.memory import service as mem
from brain.logging_config import get_logger

logger = get_logger("brain.api.routers.admin")

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/tokens", response_model=TokenResponse, status_code=201)
async def create_api_token(req: TokenCreateRequest) -> dict:
    """Create a new API token."""
    result = await create_token(req.name, req.scopes, req.expiry_days)
    return result


@router.get("/tokens", response_model=list[TokenResponse])
async def list_api_tokens() -> list[dict]:
    """List all API tokens."""
    return await list_tokens()


@router.delete("/tokens/{token_id}")
async def delete_api_token(token_id: str) -> dict:
    """Revoke (delete) an API token."""
    success = await revoke_token(token_id)
    if not success:
        raise HTTPException(status_code=404, detail="Token not found")
    return {"deleted": True}


@router.get("/stats")
async def system_stats() -> dict:
    """Get system-wide statistics."""
    memory_stats = await mem.get_memory_stats()
    return {
        "memory": memory_stats,
        "version": "0.1.0",
    }
