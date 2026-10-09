"""Memory deduplication service — detect and flag near-duplicate memories."""

from __future__ import annotations

from brain.core.db import fetch_all, execute
from brain.logging_config import get_logger

logger = get_logger("brain.memory.deduplication")


async def find_duplicates(
    threshold: float = 0.95,
    space: str | None = None,
    limit: int = 20,
) -> list[dict]:
    """Find potential duplicate memories by cosine similarity.

    Uses pgvector <=> operator to find near-duplicate embeddings.
    """
    space_filter = ""
    params: list = [threshold, limit]

    if space:
        space_filter = "AND c2.space_id = (SELECT id FROM memory_spaces WHERE name = %s)"
        params.insert(1, space)

    rows = await fetch_all(
        f"""
        SELECT
            c1.id as id_a, c1.content as content_a, c1.created_at as created_at_a,
            c2.id as id_b, c2.content as content_b, c2.created_at as created_at_b,
            1 - (c1.embedding <=> c2.embedding) as similarity
        FROM chunks c1
        JOIN chunks c2 ON c1.id < c2.id
        WHERE c1.forgotten = FALSE
          AND c2.forgotten = FALSE
          AND c1.embedding IS NOT NULL
          AND c2.embedding IS NOT NULL
          AND 1 - (c1.embedding <=> c2.embedding) > %s
          {space_filter}
        ORDER BY similarity DESC
        LIMIT %s
        """,
        tuple(params),
    )

    return [dict(r) for r in rows]


async def merge_duplicates(keep_id: str, remove_id: str) -> dict:
    """Merge two duplicate memories — keep one, forget the other.

    Preserves source_count by summing.
    """
    # Update source_count on the kept memory
    await execute(
        """
        UPDATE chunks
        SET source_count = source_count + (SELECT source_count FROM chunks WHERE id = %s),
            updated_at = now()
        WHERE id = %s
        """,
        (remove_id, keep_id),
    )

    # Forget the duplicate
    await execute(
        "UPDATE chunks SET forgotten = TRUE, state = 'forgotten', updated_at = now() WHERE id = %s",
        (remove_id,),
    )

    logger.info("duplicates_merged", keep_id=keep_id, remove_id=remove_id)
    return {"kept": keep_id, "removed": remove_id}
