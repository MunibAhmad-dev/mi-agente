"""Graph writer — persist extracted entities and relationships to the database."""

from __future__ import annotations

from typing import Any

from brain.core.db import execute, fetch_one
from brain.knowledge.service import create_entity, create_relationship, add_mention
from brain.logging_config import get_logger

logger = get_logger("brain.knowledge.extraction.writer")


async def write_entities(
    entities: list[dict[str, Any]],
    chunk_id: str | None = None,
    space: str | None = None,
) -> list[dict]:
    """Persist extracted entities to the database.

    Returns list of {entity_id, name, type} for created/found entities.
    """
    written = []

    for ent in entities:
        name = ent.get("name", "").strip()
        entity_type = ent.get("type", "Concept")

        if not name:
            continue

        result = await create_entity(name=name, entity_type=entity_type, space=space)

        # Add mention if chunk_id provided
        if chunk_id and result.get("id"):
            await add_mention(
                entity_id=result["id"],
                chunk_id=chunk_id,
                start_offset=ent.get("start", 0),
                end_offset=ent.get("end", 0),
                context=ent.get("context", ""),
            )

        written.append({
            "entity_id": result["id"],
            "name": name,
            "type": entity_type,
        })

    logger.info("entities_written", count=len(written))
    return written


async def write_relationships(
    relationships: list[dict[str, Any]],
    chunk_id: str | None = None,
) -> list[dict]:
    """Persist extracted relationships to the database.

    Resolves entity names to IDs first.
    """
    written = []

    for rel in relationships:
        source_name = rel.get("source", "").strip()
        target_name = rel.get("target", "").strip()

        if not source_name or not target_name or source_name == target_name:
            continue

        # Resolve entity IDs
        source_row = await fetch_one(
            "SELECT id FROM entities WHERE lower(name) = lower(%s) LIMIT 1",
            (source_name,),
        )
        target_row = await fetch_one(
            "SELECT id FROM entities WHERE lower(name) = lower(%s) LIMIT 1",
            (target_name,),
        )

        if not source_row or not target_row:
            continue

        result = await create_relationship(
            source_entity_id=source_row["id"],
            target_entity_id=target_row["id"],
            rel_type=rel.get("type", "related_to"),
            strength=rel.get("confidence", 0.5),
            chunk_id=chunk_id,
        )

        written.append({
            "rel_id": result["id"],
            "source": source_name,
            "target": target_name,
            "type": rel.get("type", "related_to"),
        })

    logger.info("relationships_written", count=len(written))
    return written


async def write_extraction_results(
    extraction: dict[str, Any],
    chunk_id: str | None = None,
    space: str | None = None,
) -> dict:
    """Write complete extraction results (entities + relationships) to graph."""
    entities_written = await write_entities(
        extraction.get("entities", []),
        chunk_id=chunk_id,
        space=space,
    )

    relationships_written = await write_relationships(
        extraction.get("relationships", []),
        chunk_id=chunk_id,
    )

    return {
        "entities": entities_written,
        "relationships": relationships_written,
    }
