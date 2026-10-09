"""Search API router — hybrid search with caching."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from brain.api.schemas import SearchRequest, SearchResponse, SearchResultItem
from brain.rag.search import hybrid_search
from brain.rag.cache import search_cache
from brain.logging_config import get_logger

logger = get_logger("brain.api.routers.search")

router = APIRouter(prefix="/api/search", tags=["search"])


@router.post("", response_model=SearchResponse)
async def search(req: SearchRequest) -> SearchResponse:
    """Hybrid search — vector similarity + full-text search + RRF fusion.

    Results are cached for 5 minutes to avoid repeated expensive operations.
    """
    # Check cache first
    cached = search_cache.get(req.query, req.space, req.limit)
    if cached is not None:
        logger.info("search_cache_hit", query=req.query)
        return cached

    try:
        result = await hybrid_search(
            query=req.query,
            space=req.space,
            limit=req.limit,
        )
    except Exception as e:
        logger.error("search_error", query=req.query, error=str(e))
        raise HTTPException(status_code=500, detail=f"Search failed: {e}")

    results = [
        SearchResultItem(
            chunk_id=str(r["chunk_id"]),
            content=r["content"],
            similarity=round(float(r.get("final_score", r.get("similarity", 0))), 4),
            source_name=r.get("source_name"),
            source_type=r.get("source_type"),
            space=r.get("space", "default"),
            metadata=r.get("metadata") or {},
        )
        for r in result["results"]
    ]

    response = SearchResponse(
        results=results,
        query=req.query,
        latency_ms=result["diagnostics"]["total_ms"],
    )

    # Cache the response
    search_cache.set(req.query, req.space, req.limit, response)

    return response


@router.get("/cache/stats")
async def cache_stats() -> dict:
    """Get search cache statistics."""
    return search_cache.stats()
