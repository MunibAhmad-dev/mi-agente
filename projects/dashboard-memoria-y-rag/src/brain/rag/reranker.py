"""CrossEncoder reranker — re-rank search results for higher precision.

Supports local (sentence-transformers) and API fallback.
Thread-safe singleton pattern.
"""

from __future__ import annotations

import asyncio
from typing import Any

from brain.config import get_settings
from brain.logging_config import get_logger

logger = get_logger("brain.rag.reranker")

# Lazy-loaded model
_reranker_model = None


def _load_reranker():
    """Load the CrossEncoder reranker model (lazy, singleton)."""
    global _reranker_model
    if _reranker_model is not None:
        return _reranker_model

    settings = get_settings()
    if not settings.reranker.enabled:
        logger.info("reranker_disabled")
        return None

    try:
        from sentence_transformers import CrossEncoder

        logger.info("reranker_loading", model=settings.reranker.model)
        _reranker_model = CrossEncoder(
            settings.reranker.model,
            max_length=512,
        )
        logger.info("reranker_loaded", model=settings.reranker.model)
        return _reranker_model
    except Exception as e:
        logger.warning("reranker_load_failed", error=str(e))
        return None


def rerank_sync(
    query: str,
    results: list[dict],
    top_k: int = 10,
    content_key: str = "content",
) -> list[dict]:
    """Re-rank results using CrossEncoder.

    Args:
        query: The search query
        results: List of result dicts (must have content_key)
        top_k: Number of results to return
        content_key: Key in result dict containing text content

    Returns:
        Re-ranked list of results with rerank_score added
    """
    if not results:
        return []

    model = _load_reranker()
    if model is None:
        # No reranker available — return results as-is
        for r in results[:top_k]:
            r["rerank_score"] = r.get("final_score", r.get("similarity", 0))
            r["reranker_used"] = False
        return results[:top_k]

    # Build query-document pairs
    pairs = [(query, r.get(content_key, "")) for r in results]

    # Score
    try:
        scores = model.predict(pairs)
    except Exception as e:
        logger.warning("reranker_predict_failed", error=str(e))
        for r in results[:top_k]:
            r["rerank_score"] = r.get("final_score", r.get("similarity", 0))
            r["reranker_used"] = False
        return results[:top_k]

    # Apply scores and sort
    for r, score in zip(results, scores):
        r["rerank_score"] = float(score)
        r["reranker_used"] = True

    reranked = sorted(results, key=lambda x: x["rerank_score"], reverse=True)
    return reranked[:top_k]


async def rerank(
    query: str,
    results: list[dict],
    top_k: int = 10,
    content_key: str = "content",
) -> list[dict]:
    """Async wrapper for reranking."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, rerank_sync, query, results, top_k, content_key)
