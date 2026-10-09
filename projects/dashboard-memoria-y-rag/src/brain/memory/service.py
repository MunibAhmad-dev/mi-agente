"""Memory service — CRUD, lifecycle management, deduplication, search."""

from __future__ import annotations

import hashlib
from typing import Any

from brain.core.db import execute, fetch_all, fetch_one, execute_many
from brain.core.exceptions import DuplicateMemoryError, MemoryError, NotFoundError
from brain.core.types import MemoryState
from brain.logging_config import get_logger

logger = get_logger("brain.memory.service")


def _content_hash(content: str) -> str:
    """SHA-256 hash of normalized content for deduplication."""
    normalized = content.strip().lower()
    return hashlib.sha256(normalized.encode()).hexdigest()


# === Memory CRUD ===


async def create_memory(
    content: str,
    space: str = "default",
    category: str = "fact",
    importance: float = 0.5,
    metadata: dict[str, Any] | None = None,
    source_name: str | None = None,
    source_type: str | None = None,
    embedding: list[float] | None = None,
) -> dict:
    """Create a new memory (chunk).

    Raises DuplicateMemoryError if content hash already exists.
    """
    content_h = _content_hash(content)

    # Check for duplicates
    existing = await fetch_one(
        "SELECT id FROM chunks WHERE content_hash = %s AND forgotten = FALSE",
        (content_h,),
    )
    if existing:
        raise DuplicateMemoryError(f"Memory with identical content already exists: {existing['id']}")

    # Get or create space
    space_row = await fetch_one(
        "SELECT id FROM memory_spaces WHERE name = %s", (space,)
    )
    if not space_row:
        space_row_id = await execute(
            "INSERT INTO memory_spaces (name) VALUES (%s) RETURNING id",
            (space,),
        )
    else:
        space_row_id = space_row["id"]

    # Serialize embedding as pgvector string
    embedding_str = None
    if embedding:
        embedding_str = f"[{','.join(str(v) for v in embedding)}]"

    chunk_id = await execute(
        """
        INSERT INTO chunks (space_id, content, embedding, content_hash, state, category, importance, metadata, source_name, source_type)
        VALUES (%s, %s, %s::vector, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (space_row_id, content, embedding_str, content_h, "extracted", category, importance,
         "{}", source_name, source_type),
    )

    logger.info("memory_created", chunk_id=chunk_id, space=space, category=category)

    return {
        "id": chunk_id,
        "content": content,
        "space": space,
        "category": category,
        "importance": importance,
        "state": "extracted",
        "source_name": source_name,
        "source_type": source_type,
    }


async def get_memory(chunk_id: str) -> dict:
    """Get a single memory by ID."""
    row = await fetch_one(
        """
        SELECT c.*, ms.name as space_name
        FROM chunks c
        JOIN memory_spaces ms ON ms.id = c.space_id
        WHERE c.id = %s
        """,
        (chunk_id,),
    )
    if not row:
        raise NotFoundError(f"Memory not found: {chunk_id}")
    return dict(row)


async def list_memories(
    space: str | None = None,
    state: str | None = None,
    category: str | None = None,
    forgotten: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    """List memories with optional filters."""
    conditions = ["c.forgotten = %s"]
    params: list[Any] = [forgotten]

    if space:
        conditions.append("ms.name = %s")
        params.append(space)
    if state:
        conditions.append("c.state = %s")
        params.append(state)
    if category:
        conditions.append("c.category = %s")
        params.append(category)

    where = " AND ".join(conditions)

    rows = await fetch_all(
        f"""
        SELECT c.id, c.content, c.category, c.importance, c.state,
               c.source_name, c.source_type, c.source_count,
               c.metadata, c.created_at, c.updated_at,
               ms.name as space_name
        FROM chunks c
        JOIN memory_spaces ms ON ms.id = c.space_id
        WHERE {where}
        ORDER BY c.created_at DESC
        LIMIT %s OFFSET %s
        """,
        (*params, limit, offset),
    )
    return [dict(r) for r in rows]


async def update_memory(chunk_id: str, **fields: Any) -> dict:
    """Update a memory by ID. Only provided fields are updated."""
    allowed = {"content", "category", "importance", "state", "metadata"}
    updates = {k: v for k, v in fields.items() if k in allowed and v is not None}

    if not updates:
        return await get_memory(chunk_id)

    set_clauses = []
    params: list[Any] = []
    for key, value in updates.items():
        set_clauses.append(f"{key} = %s")
        params.append(value)
    set_clauses.append("updated_at = now()")
    params.append(chunk_id)

    set_sql = ", ".join(set_clauses)

    # If content is updated, re-hash
    if "content" in updates:
        set_clauses[-1] = f"content_hash = %s, updated_at = now()"
        params.insert(-1, _content_hash(updates["content"]))

    await execute(
        f"UPDATE chunks SET {', '.join(set_clauses)} WHERE id = %s",
        tuple(params),
    )

    logger.info("memory_updated", chunk_id=chunk_id, fields=list(updates.keys()))
    return await get_memory(chunk_id)


async def forget_memory(chunk_id: str) -> dict:
    """Soft-delete a memory (set forgotten = TRUE)."""
    row = await fetch_one("SELECT id FROM chunks WHERE id = %s", (chunk_id,))
    if not row:
        raise NotFoundError(f"Memory not found: {chunk_id}")

    await execute(
        """
        UPDATE chunks SET forgotten = TRUE, state = 'forgotten', updated_at = now()
        WHERE id = %s
        """,
        (chunk_id,),
    )

    # Record state transition
    await execute(
        "INSERT INTO memory_states (chunk_id, state, reason) VALUES (%s, 'forgotten', 'user_action')",
        (chunk_id,),
    )

    logger.info("memory_forgotten", chunk_id=chunk_id)
    return {"id": chunk_id, "forgotten": True}


async def purge_forgotten(min_age_days: int = 90) -> int:
    """Permanently delete old forgotten memories."""
    pool_conn = await execute(
        """
        DELETE FROM chunks
        WHERE forgotten = TRUE AND updated_at < now() - INTERVAL '%s days'
        """,
        (min_age_days,),
    )
    logger.info("memories_purged", min_age_days=min_age_days)
    return 0  # Actual count from cursor if needed


async def move_memory(chunk_id: str, target_space: str) -> dict:
    """Move a memory to a different space."""
    # Ensure target space exists
    space_row = await fetch_one(
        "SELECT id FROM memory_spaces WHERE name = %s", (target_space,)
    )
    if not space_row:
        space_row_id = await execute(
            "INSERT INTO memory_spaces (name) VALUES (%s) RETURNING id",
            (target_space,),
        )
    else:
        space_row_id = space_row["id"]

    await execute(
        "UPDATE chunks SET space_id = %s, updated_at = now() WHERE id = %s",
        (space_row_id, chunk_id),
    )

    logger.info("memory_moved", chunk_id=chunk_id, target_space=target_space)
    return await get_memory(chunk_id)


async def get_memory_stats() -> dict:
    """Get memory statistics."""
    total = (await fetch_one("SELECT count(*) as cnt FROM chunks"))["cnt"]
    active = (await fetch_one("SELECT count(*) as cnt FROM chunks WHERE forgotten = FALSE"))["cnt"]
    forgotten = total - active

    state_rows = await fetch_all(
        "SELECT state, count(*) as cnt FROM chunks WHERE forgotten = FALSE GROUP BY state"
    )
    by_state = {r["state"]: r["cnt"] for r in state_rows}

    cat_rows = await fetch_all(
        "SELECT category, count(*) as cnt FROM chunks WHERE forgotten = FALSE GROUP BY category"
    )
    by_category = {r["category"]: r["cnt"] for r in cat_rows}

    spaces = (await fetch_one("SELECT count(*) as cnt FROM memory_spaces"))["cnt"]

    return {
        "total": total,
        "active": active,
        "forgotten": forgotten,
        "by_state": by_state,
        "by_category": by_category,
        "spaces": spaces,
    }


# === Space CRUD ===


async def create_space(name: str, description: str = "", color: str = "#6366f1") -> dict:
    """Create a new memory space."""
    space_id = await execute(
        "INSERT INTO memory_spaces (name, description, color) VALUES (%s, %s, %s) RETURNING id",
        (name, description, color),
    )
    logger.info("space_created", space_id=space_id, name=name)
    return {"id": space_id, "name": name, "description": description, "color": color}


async def list_spaces() -> list[dict]:
    """List all memory spaces with chunk counts."""
    rows = await fetch_all(
        """
        SELECT ms.*, COUNT(c.id) as chunk_count
        FROM memory_spaces ms
        LEFT JOIN chunks c ON c.space_id = ms.id AND c.forgotten = FALSE
        GROUP BY ms.id
        ORDER BY ms.name
        """,
    )
    return [dict(r) for r in rows]
