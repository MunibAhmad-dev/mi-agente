"""Health check endpoint."""

from __future__ import annotations

from fastapi import APIRouter

from brain import __version__
from brain.api.schemas import HealthResponse
from brain.core.db import fetch_one

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """System health check — verifies database connectivity."""
    db_status = "connected"
    try:
        await fetch_one("SELECT 1")
    except Exception:
        db_status = "disconnected"

    # Check embedding backend
    try:
        from brain.embedding.service import get_backend
        emb_backend = get_backend()
    except Exception:
        emb_backend = "unknown"

    return HealthResponse(
        status="ok" if db_status == "connected" else "degraded",
        version=__version__,
        database=db_status,
        embedding_backend=emb_backend,
    )
