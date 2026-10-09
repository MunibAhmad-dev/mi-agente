"""Memory API router — CRUD, lifecycle, spaces, stats."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from brain.api.schemas import (
    MemoryCreateRequest,
    MemoryListResponse,
    MemoryResponse,
    MemoryStatsResponse,
    MemoryUpdateRequest,
    SpaceCreateRequest,
    SpaceResponse,
)
from brain.memory import service as mem
from brain.core.exceptions import DuplicateMemoryError, NotFoundError
from brain.logging_config import get_logger

logger = get_logger("brain.api.routers.memory")

router = APIRouter(prefix="/api/memory", tags=["memory"])


# === Memory CRUD ===

@router.post("", response_model=MemoryResponse, status_code=201)
async def create_memory(req: MemoryCreateRequest) -> dict:
    """Create a new memory."""
    try:
        result = await mem.create_memory(
            content=req.content,
            space=req.space,
            category=req.category,
            importance=req.importance,
            metadata=req.metadata,
            source_name=req.source_name,
            source_type=req.source_type,
        )
        return {
            "id": result["id"],
            "content": result["content"],
            "space": result["space"],
            "category": result["category"],
            "importance": result["importance"],
            "state": result["state"],
            "source_name": result.get("source_name"),
            "source_type": result.get("source_type"),
            "source_count": 1,
            "forgotten": False,
            "metadata": {},
            "created_at": "",
            "updated_at": "",
        }
    except DuplicateMemoryError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("", response_model=MemoryListResponse)
async def list_memories(
    space: str | None = None,
    state: str | None = None,
    category: str | None = None,
    forgotten: bool = False,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> MemoryListResponse:
    """List memories with optional filters."""
    rows = await mem.list_memories(
        space=space, state=state, category=category,
        forgotten=forgotten, limit=limit, offset=offset,
    )
    # Normalize DB types for Pydantic schema
    memories = []
    for r in rows:
        memories.append({
            "id": str(r["id"]),
            "content": r["content"],
            "space": r.get("space_name", "default"),
            "category": r.get("category", "fact"),
            "importance": float(r.get("importance", 0.5)),
            "state": r.get("state", "extracted"),
            "source_name": r.get("source_name"),
            "source_type": r.get("source_type"),
            "source_count": r.get("source_count", 1),
            "forgotten": r.get("forgotten", False),
            "metadata": r.get("metadata") or {},
            "created_at": r["created_at"].isoformat() if hasattr(r["created_at"], "isoformat") else str(r["created_at"]),
            "updated_at": r["updated_at"].isoformat() if hasattr(r["updated_at"], "isoformat") else str(r["updated_at"]),
        })
    return MemoryListResponse(memories=memories, total=len(memories))


@router.get("/stats", response_model=MemoryStatsResponse)
async def get_memory_stats() -> MemoryStatsResponse:
    """Get memory statistics."""
    stats = await mem.get_memory_stats()
    return MemoryStatsResponse(**stats)


@router.get("/{chunk_id}", response_model=MemoryResponse)
async def get_memory(chunk_id: str) -> dict:
    """Get a single memory by ID."""
    try:
        return await mem.get_memory(chunk_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/{chunk_id}", response_model=MemoryResponse)
async def update_memory(chunk_id: str, req: MemoryUpdateRequest) -> dict:
    """Update a memory."""
    try:
        return await mem.update_memory(
            chunk_id,
            content=req.content,
            category=req.category,
            importance=req.importance,
            state=req.state,
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{chunk_id}/forget", response_model=dict)
async def forget_memory(chunk_id: str) -> dict:
    """Soft-delete (forget) a memory."""
    try:
        return await mem.forget_memory(chunk_id)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{chunk_id}/move", response_model=MemoryResponse)
async def move_memory(chunk_id: str, req: SpaceCreateRequest) -> dict:
    """Move a memory to a different space."""
    try:
        return await mem.move_memory(chunk_id, req.name)
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


# === Spaces ===

@router.get("/spaces/all", response_model=list[SpaceResponse])
async def list_spaces() -> list[dict]:
    """List all memory spaces."""
    return await mem.list_spaces()


@router.post("/spaces", response_model=SpaceResponse, status_code=201)
async def create_space(req: SpaceCreateRequest) -> dict:
    """Create a new memory space."""
    return await mem.create_space(req.name, req.description, req.color)
