"""Knowledge service - entity CRUD, relationship management, graph visualization."""

from __future__ import annotations

from typing import Any

from brain.core.db import execute, fetch_all, fetch_one
from brain.core.exceptions import NotFoundError
from brain.logging_config import get_logger

logger = get_logger("brain.knowledge.service")


# === Entity CRUD ===

async def create_entity(
    name: str,
    entity_type: str = "Concept",
    space: str | None = None,
    properties: dict[str, Any] | None = None,
) -> dict:
    """Create or update an entity (UPSERT)."""
    space_id = None
    if space:
        row = await fetch_one("SELECT id FROM memory_spaces WHERE name = %s", (space,))
        if row:
            space_id = row["id"]

    entity_id = await execute(
        """
        INSERT INTO entities (name, type, space_id, properties)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (lower(name), type, space_id)
        DO UPDATE SET mention_count = entities.mention_count + 1, updated_at = now()
        RETURNING id
        """,
        (name, entity_type, space_id, "{}"),
    )

    logger.info("entity_created", entity_id=entity_id, name=name, type=entity_type)
    return {"id": entity_id, "name": name, "type": entity_type, "space_id": space_id}


async def get_entity(entity_id: str) -> dict:
    """Get entity by ID with related data."""
    row = await fetch_one(
        """
        SELECT e.*, ms.name as space_name
        FROM entities e
        LEFT JOIN memory_spaces ms ON ms.id = e.space_id
        WHERE e.id = %s
        """,
        (entity_id,),
    )
    if not row:
        raise NotFoundError(f"Entity not found: {entity_id}")
    return dict(row)


async def list_entities(
    entity_type: str | None = None,
    space: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    """List entities with optional filters."""
    conditions = []
    params: list[Any] = []

    if entity_type:
        conditions.append("e.type = %s")
        params.append(entity_type)
    if space:
        conditions.append("ms.name = %s")
        params.append(space)

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    rows = await fetch_all(
        f"""
        SELECT e.id, e.name, e.type, e.mention_count, e.properties,
               e.created_at, e.updated_at,
               ms.name as space_name
        FROM entities e
        LEFT JOIN memory_spaces ms ON ms.id = e.space_id
        {where}
        ORDER BY e.mention_count DESC, e.name
        LIMIT %s OFFSET %s
        """,
        (*params, limit, offset),
    )
    return [dict(r) for r in rows]


# === Relationship CRUD ===

async def create_relationship(
    source_entity_id: str,
    target_entity_id: str,
    rel_type: str = "related_to",
    strength: float = 1.0,
    chunk_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict:
    """Create or update a relationship (UPSERT)."""
    rel_id = await execute(
        """
        INSERT INTO relationships (source_entity_id, target_entity_id, type, strength, chunk_id, metadata)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (source_entity_id, target_entity_id, type)
        DO UPDATE SET strength = GREATEST(relationships.strength, EXCLUDED.strength)
        RETURNING id
        """,
        (source_entity_id, target_entity_id, rel_type, strength, chunk_id, "{}"),
    )

    logger.info("relationship_created", rel_id=rel_id, type=rel_type)
    return {"id": rel_id, "source": source_entity_id, "target": target_entity_id, "type": rel_type}


async def list_relationships(
    entity_id: str | None = None,
    rel_type: str | None = None,
    limit: int = 100,
) -> list[dict]:
    """List relationships with optional filters."""
    conditions = []
    params: list[Any] = []

    if entity_id:
        conditions.append("(r.source_entity_id = %s OR r.target_entity_id = %s)")
        params.extend([entity_id, entity_id])
    if rel_type:
        conditions.append("r.type = %s")
        params.append(rel_type)

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    rows = await fetch_all(
        f"""
        SELECT r.id, r.type, r.strength, r.chunk_id, r.metadata, r.created_at,
               r.source_entity_id, r.target_entity_id,
               s.name as source_name, s.type as source_type,
               t.name as target_name, t.type as target_type
        FROM relationships r
        JOIN entities s ON s.id = r.source_entity_id
        JOIN entities t ON t.id = r.target_entity_id
        {where}
        ORDER BY r.strength DESC
        LIMIT %s
        """,
        (*params, limit),
    )
    return [dict(r) for r in rows]


# === Graph Visualization ===

async def get_graph_data(
    entity_type: str | None = None,
    space: str | None = None,
    limit: int = 300,
    min_mentions: int = 1,
) -> dict:
    """Get graph visualization data (nodes + edges) for the frontend."""
    conditions = ["e.mention_count >= %s"]
    params: list[Any] = [min_mentions]

    if entity_type:
        conditions.append("e.type = %s")
        params.append(entity_type)
    if space:
        conditions.append("ms.name = %s")
        params.append(space)

    where = "WHERE " + " AND ".join(conditions)

    # Nodes
    entity_rows = await fetch_all(
        f"""
        SELECT e.id, e.name, e.type, e.mention_count, e.properties,
               ms.name as space_name
        FROM entities e
        LEFT JOIN memory_spaces ms ON ms.id = e.space_id
        {where}
        ORDER BY e.mention_count DESC
        LIMIT %s
        """,
        (*params, limit),
    )

    entity_ids = {str(r["id"]) for r in entity_rows}

    # Edges
    edge_rows: list = []
    if entity_ids:
        edge_rows = await fetch_all(
            """
            SELECT r.id, r.type, r.strength,
                   r.source_entity_id, r.target_entity_id,
                   s.name as source_name, t.name as target_name
            FROM relationships r
            JOIN entities s ON s.id = r.source_entity_id
            JOIN entities t ON t.id = r.target_entity_id
            ORDER BY r.strength DESC
            LIMIT %s
            """,
            (limit * 2,),
        )

    nodes = [
        {
            "id": str(r["id"]),
            "name": r["name"],
            "type": r["type"],
            "mentions": r["mention_count"],
            "space": r.get("space_name", "default"),
            "size": max(3, min(20, r["mention_count"] * 2)),
        }
        for r in entity_rows
    ]

    edges = [
        {
            "id": str(r["id"]),
            "source": str(r["source_entity_id"]),
            "target": str(r["target_entity_id"]),
            "type": r["type"],
            "strength": float(r["strength"]),
            "label": f"{r['source_name']} -> {r['target_name']}",
        }
        for r in edge_rows
        if str(r["source_entity_id"]) in entity_ids and str(r["target_entity_id"]) in entity_ids
    ]

    return {
        "nodes": nodes,
        "edges": edges,
        "stats": {
            "node_count": len(nodes),
            "edge_count": len(edges),
            "entity_types": list({n["type"] for n in nodes}),
        },
    }


# === Entity Mention Tracking ===

async def add_mention(
    entity_id: str,
    chunk_id: str,
    start_offset: int,
    end_offset: int,
    context: str = "",
) -> dict:
    """Add an entity mention (link entity to chunk)."""
    mention_id = await execute(
        """
        INSERT INTO entity_mentions (entity_id, chunk_id, start_offset, end_offset, context)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id
        """,
        (entity_id, chunk_id, start_offset, end_offset, context),
    )

    await execute(
        "UPDATE entities SET mention_count = mention_count + 1, updated_at = now() WHERE id = %s",
        (entity_id,),
    )

    return {"id": mention_id, "entity_id": entity_id, "chunk_id": chunk_id}


async def get_entity_mentions(entity_id: str, limit: int = 20) -> list[dict]:
    """Get all mentions of an entity."""
    rows = await fetch_all(
        """
        SELECT em.id, em.start_offset, em.end_offset, em.context, em.created_at,
               c.content as chunk_content, c.id as chunk_id
        FROM entity_mentions em
        JOIN chunks c ON c.id = em.chunk_id
        WHERE em.entity_id = %s
        ORDER BY em.created_at DESC
        LIMIT %s
        """,
        (entity_id, limit),
    )
    return [dict(r) for r in rows]


# === Source Traceability ===

async def trace_provenance(chunk_id: str) -> dict:
    """Trace the full provenance chain for a chunk.

    Returns: chunk -> entities -> document -> source
    """
    chunk = await fetch_one(
        """
        SELECT c.*, d.filename as doc_filename, d.status as doc_status,
               s.name as source_name, s.type as source_type
        FROM chunks c
        LEFT JOIN documents d ON d.id = c.document_id
        LEFT JOIN sources s ON s.id = c.source_id
        WHERE c.id = %s
        """,
        (chunk_id,),
    )
    if not chunk:
        raise NotFoundError(f"Chunk not found: {chunk_id}")

    entities = await fetch_all(
        """
        SELECT e.name, e.type, em.start_offset, em.end_offset, em.context
        FROM entity_mentions em
        JOIN entities e ON e.id = em.entity_id
        WHERE em.chunk_id = %s
        """,
        (chunk_id,),
    )

    return {
        "chunk_id": str(chunk["id"]),
        "content": chunk["content"],
        "document": {
            "id": str(chunk.get("document_id", "")),
            "filename": chunk.get("doc_filename"),
            "status": chunk.get("doc_status"),
        } if chunk.get("document_id") else None,
        "source": {
            "name": chunk.get("source_name"),
            "type": chunk.get("source_type"),
        } if chunk.get("source_name") else None,
        "entities": [dict(e) for e in entities],
    }
