"""Hybrid search engine — vector similarity + full-text search + RRF fusion.

This is the core retrieval pipeline for the Brain.
"""

from __future__ import annotations

import time
from typing import Any

from brain.config import get_settings
from brain.core.db import fetch_all
from brain.embedding.service import embed_one
from brain.logging_config import get_logger

logger = get_logger("brain.rag.search")


async def vector_search(
    query_embedding: list[float],
    space: str | None = None,
    limit: int = 30,
) -> list[dict]:
    """Vector similarity search using pgvector HNSW."""
    embedding_str = f"[{','.join(str(v) for v in query_embedding)}]"
    space_filter = ""
    params: list = [embedding_str]

    if space:
        space_filter = "AND ms.name = %s"
        params.append(space)

    params.extend([embedding_str, limit])

    rows = await fetch_all(
        f"""
        SELECT
            c.id as chunk_id, c.content, c.metadata, c.importance,
            c.source_name, c.source_type, c.created_at,
            ms.name as space,
            1 - (c.embedding <=> %s::vector) as similarity
        FROM chunks c
        JOIN memory_spaces ms ON ms.id = c.space_id
        WHERE c.forgotten = FALSE AND c.embedding IS NOT NULL {space_filter}
        ORDER BY c.embedding <=> %s::vector
        LIMIT %s
        """,
        tuple(params),
    )

    return [
        {
            **dict(r),
            "vector_rank": i + 1,
            "vector_score": float(r["similarity"]),
        }
        for i, r in enumerate(rows)
    ]


async def fts_search(
    query: str,
    space: str | None = None,
    limit: int = 30,
) -> list[dict]:
    """Full-text search using tsvector GIN index + ts_rank."""
    space_filter = ""
    # 4 placeholders: 1 SELECT rank + 2 WHERE + 1 ORDER BY + 1 LIMIT
    params: list = [query, query, query, query, limit]

    if space:
        space_filter = "AND ms.name = %s"
        params.insert(2, space)

    rows = await fetch_all(
        f"""
        SELECT
            c.id as chunk_id, c.content, c.metadata, c.importance,
            c.source_name, c.source_type, c.created_at,
            ms.name as space,
            ts_rank_cd(to_tsvector('english', c.content), plainto_tsquery('english', %s)) as fts_rank
        FROM chunks c
        JOIN memory_spaces ms ON ms.id = c.space_id
        WHERE c.forgotten = FALSE
          AND (c.content @@ plainto_tsquery('english', %s)
               OR c.content ILIKE '%%' || %s || '%%')
          {space_filter}
        ORDER BY ts_rank_cd(to_tsvector('english', c.content), plainto_tsquery('english', %s)) DESC
        LIMIT %s
        """,
        tuple(params),
    )

    return [
        {
            **dict(r),
            "fts_rank": i + 1,
            "fts_score": float(r.get("content_fts_rank") or r.get("fts_rank") or 0),
        }
        for i, r in enumerate(rows)
    ]


def rrf_merge(
    vector_results: list[dict],
    fts_results: list[dict],
    weight_vector: float = 1.0,
    weight_fts: float = 0.5,
    k: int = 60,
) -> list[dict]:
    """Reciprocal Rank Fusion — merge ranked lists from vector and FTS search.

    RRF_score = weight_vector / (k + vector_rank) + weight_fts / (k + fts_rank)
    """
    merged: dict[str, dict] = {}

    # Index vector results
    for r in vector_results:
        cid = str(r["chunk_id"])
        rrf = weight_vector / (k + r["vector_rank"])
        merged[cid] = {
            **r,
            "rrf_score": rrf,
            "vector_rank": r["vector_rank"],
            "fts_rank": None,
        }

    # Merge FTS results
    for r in fts_results:
        cid = str(r["chunk_id"])
        fts_rrf = weight_fts / (k + r["fts_rank"])

        if cid in merged:
            merged[cid]["rrf_score"] += fts_rrf
            merged[cid]["fts_rank"] = r["fts_rank"]
        else:
            merged[cid] = {
                **r,
                "rrf_score": fts_rrf,
                "vector_rank": None,
                "fts_rank": r["fts_rank"],
            }

    return sorted(merged.values(), key=lambda x: x["rrf_score"], reverse=True)


def apply_modulation(
    results: list[dict],
    weight_importance: float = 0.15,
    weight_recency: float = 0.05,
    recency_half_life_days: int = 90,
) -> list[dict]:
    """Apply importance and recency modulation to RRF scores.

    final_score = rrf_score * (1 + importance * weight_importance) * recency_boost
    """
    import math
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)

    for r in results:
        importance = r.get("importance", 0.5)
        importance_boost = 1.0 + (importance * weight_importance)

        # Recency boost (exponential decay)
        created = r.get("created_at")
        if created:
            if hasattr(created, "timestamp"):
                age_days = (now - created).total_seconds() / 86400
            else:
                age_days = 0
            recency_boost = math.exp(-0.693 * age_days / recency_half_life_days) * weight_recency + (1 - weight_recency)
        else:
            recency_boost = 1.0

        r["final_score"] = r["rrf_score"] * importance_boost * recency_boost

    return sorted(results, key=lambda x: x["final_score"], reverse=True)


async def hybrid_search(
    query: str,
    space: str | None = None,
    limit: int = 10,
    max_results: int = 30,
) -> dict:
    """Full hybrid search pipeline: expand → embed → vector + FTS → RRF → modulate.

    Returns ranked results with diagnostics.
    """
    settings = get_settings()
    start = time.perf_counter()

    # 1. Embed query
    embed_start = time.perf_counter()
    query_embedding = await embed_one(query)
    embed_ms = round((time.perf_counter() - embed_start) * 1000, 1)

    # 2. Parallel-ish search (sequential in Python, but could be async-gathered)
    vec_start = time.perf_counter()
    vector_results = await vector_search(query_embedding, space=space, limit=max_results)
    vec_ms = round((time.perf_counter() - vec_start) * 1000, 1)

    fts_start = time.perf_counter()
    fts_results = await fts_search(query, space=space, limit=max_results)
    fts_ms = round((time.perf_counter() - fts_start) * 1000, 1)

    # 3. RRF merge
    merge_start = time.perf_counter()
    merged = rrf_merge(
        vector_results,
        fts_results,
        weight_vector=1.0,
        weight_fts=0.5,
        k=settings.search.rrf_k,
    )
    merge_ms = round((time.perf_counter() - merge_start) * 1000, 1)

    # 4. Modulation
    modulated = apply_modulation(merged)

    # 5. Trim to limit
    final = modulated[:limit]

    total_ms = round((time.perf_counter() - start) * 1000, 1)

    logger.info(
        "hybrid_search",
        query=query,
        vector_results=len(vector_results),
        fts_results=len(fts_results),
        merged=len(merged),
        final=len(final),
        embed_ms=embed_ms,
        vec_ms=vec_ms,
        fts_ms=fts_ms,
        merge_ms=merge_ms,
        total_ms=total_ms,
    )

    return {
        "results": final,
        "diagnostics": {
            "query": query,
            "vector_count": len(vector_results),
            "fts_count": len(fts_results),
            "merged_count": len(merged),
            "embed_ms": embed_ms,
            "vector_ms": vec_ms,
            "fts_ms": fts_ms,
            "merge_ms": merge_ms,
            "total_ms": total_ms,
        },
    }
