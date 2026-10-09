"""Knowledge Graph API router — entities, relationships, visualization."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from brain.knowledge.service import (
    list_entities,
    get_entity,
    list_relationships,
    get_graph_data,
    get_entity_mentions,
    trace_provenance,
)
from brain.core.exceptions import NotFoundError
from brain.logging_config import get_logger

logger = get_logger("brain.api.routers.graph")

router = APIRouter(prefix="/api/graph", tags=["graph"])


@router.get("/entities")
async def api_list_entities(
    type: str | None = None,
    space: str | None = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> dict:
    """List entities with optional type and space filters."""
    entities = await list_entities(entity_type=type, space=space, limit=limit, offset=offset)
    return {"entities": entities, "count": len(entities)}


@router.get("/entities/{entity_id}")
async def api_get_entity(entity_id: str) -> dict:
    """Get entity detail with mentions."""
    try:
        entity = await get_entity(entity_id)
        mentions = await get_entity_mentions(entity_id)
        return {"entity": entity, "mentions": mentions}
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/relationships")
async def api_list_relationships(
    entity_id: str | None = None,
    type: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
) -> dict:
    """List relationships with optional filters."""
    rels = await list_relationships(entity_id=entity_id, rel_type=type, limit=limit)
    return {"relationships": rels, "count": len(rels)}


@router.get("/visualize")
async def api_graph_visualization(
    type: str | None = None,
    space: str | None = None,
    limit: int = Query(default=300, ge=10, le=1000),
    min_mentions: int = Query(default=1, ge=1),
) -> dict:
    """Get graph visualization data for the 3D force-graph frontend."""
    return await get_graph_data(
        entity_type=type,
        space=space,
        limit=limit,
        min_mentions=min_mentions,
    )


@router.get("/provenance/{chunk_id}")
async def api_trace_provenance(chunk_id: str) -> dict:
    """Trace the full provenance chain for a chunk (why does the Brain know this?)."""
    try:
        return await trace_provenance(chunk_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
