"""Knowledge API router — manage entities and relationships."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from brain.knowledge.service import create_entity, create_relationship, get_entity
from brain.core.exceptions import NotFoundError
from brain.logging_config import get_logger

logger = get_logger("brain.api.routers.knowledge")

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


@router.post("/entities", status_code=201)
async def api_create_entity(
    name: str,
    type: str = "Concept",
    space: str | None = None,
) -> dict:
    """Create a new entity."""
    return await create_entity(name=name, entity_type=type, space=space)


@router.post("/relationships", status_code=201)
async def api_create_relationship(
    source_entity_id: str,
    target_entity_id: str,
    type: str = "related_to",
    strength: float = 1.0,
) -> dict:
    """Create a relationship between two entities."""
    try:
        return await create_relationship(
            source_entity_id=source_entity_id,
            target_entity_id=target_entity_id,
            rel_type=type,
            strength=strength,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
