"""Document ingestion pipeline — end-to-end document processing.

Flow: upload → detect format → select adapter → parse → chunk → embed → store → extract → graph
"""

from __future__ import annotations

import uuid
from typing import Any

from brain.core.db import execute, fetch_one
from brain.core.exceptions import IngestionError
from brain.documents.adapters import get_adapter
from brain.embedding.service import embed
from brain.knowledge.extraction.spacy_extractor import extract_from_text
from brain.knowledge.extraction.writer import write_extraction_results
from brain.logging_config import get_logger

logger = get_logger("brain.documents.pipeline")


async def ingest_text(
    content: str,
    source_name: str = "paste",
    source_type: str = "paste",
    space: str = "default",
    filename: str | None = None,
) -> dict:
    """Ingest plain text content directly (no file upload needed)."""
    # Get or create source
    source_id = await _get_or_create_source(source_name, source_type)

    # Create document record
    doc_id = await execute(
        """
        INSERT INTO documents (source_id, filename, status, content_type)
        VALUES (%s, %s, 'processing', 'text/plain')
        RETURNING id
        """,
        (source_id, filename or source_name),
    )

    try:
        # Chunk the text
        words = content.split()
        chunks = []
        max_words = 500
        overlap = 50
        idx = 0

        while idx < len(words):
            chunk_words = words[idx: idx + max_words]
            chunks.append(" ".join(chunk_words))
            idx += max_words - overlap

        if not chunks and content.strip():
            chunks = [content.strip()]

        # Embed all chunks
        embeddings = await embed(chunks)

        # Store chunks
        chunk_ids = []
        space_id = await _get_or_create_space(space)

        for i, (chunk_text, embedding) in enumerate(zip(chunks, embeddings)):
            embedding_str = f"[{','.join(str(v) for v in embedding)}]"
            chunk_id = await execute(
                """
                INSERT INTO chunks (space_id, content, embedding, metadata, source_name, source_type, document_id, chunk_index)
                VALUES (%s, %s, %s::vector, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (space_id, chunk_text, embedding_str, "{}", source_name, source_type, doc_id, i),
            )
            chunk_ids.append(chunk_id)

        # Extract entities and write to graph
        extraction = extract_from_text(content)
        graph_result = await write_extraction_results(extraction, chunk_id=chunk_ids[0] if chunk_ids else None, space=space)

        # Update document status
        await execute(
            """
            UPDATE documents
            SET status = 'done', chunks_created = %s, entities_found = %s,
                relationships_found = %s, finished_at = now()
            WHERE id = %s
            """,
            (len(chunk_ids), len(graph_result.get("entities", [])), len(graph_result.get("relationships", [])), doc_id),
        )

        logger.info(
            "ingestion_complete",
            doc_id=doc_id,
            chunks=len(chunk_ids),
            entities=len(graph_result.get("entities", [])),
        )

        return {
            "document_id": doc_id,
            "source_id": source_id,
            "chunks_created": len(chunk_ids),
            "entities_found": len(graph_result.get("entities", [])),
            "relationships_found": len(graph_result.get("relationships", [])),
            "chunk_ids": chunk_ids,
        }

    except Exception as e:
        await execute(
            "UPDATE documents SET status = 'error', error_message = %s WHERE id = %s",
            (str(e), doc_id),
        )
        raise IngestionError(f"Ingestion failed: {e}") from e


async def ingest_file(
    file_content: bytes,
    filename: str,
    source_name: str | None = None,
    space: str = "default",
) -> dict:
    """Ingest a file — detect format, parse, chunk, embed, store, extract."""
    # Select adapter
    adapter = get_adapter(filename)
    if adapter is None:
        # Fallback to plain text
        from brain.documents.adapters.plaintext import PlainTextAdapter
        adapter = PlainTextAdapter()

    # Get or create source
    source_id = await _get_or_create_source(source_name or filename, "file")

    # Create document record
    doc_id = await execute(
        """
        INSERT INTO documents (source_id, filename, status, content_type)
        VALUES (%s, %s, 'processing', %s)
        RETURNING id
        """,
        (source_id, filename, adapter.name),
    )

    try:
        # Parse document
        raw_chunks = await adapter.parse(file_content, filename)

        if not raw_chunks:
            await execute(
                "UPDATE documents SET status = 'done', chunks_created = 0 WHERE id = %s",
                (doc_id,),
            )
            return {"document_id": doc_id, "chunks_created": 0, "entities_found": 0}

        # Embed all chunks
        texts = [rc.content for rc in raw_chunks]
        embeddings = await embed(texts)

        # Store chunks
        chunk_ids = []
        space_id = await _get_or_create_space(space)

        for i, (rc, embedding) in enumerate(zip(raw_chunks, embeddings)):
            embedding_str = f"[{','.join(str(v) for v in embedding)}]"
            chunk_id = await execute(
                """
                INSERT INTO chunks (space_id, content, embedding, metadata, source_name, source_type, document_id, chunk_index)
                VALUES (%s, %s, %s::vector, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (space_id, rc.content, embedding_str, "{}", filename, "file", doc_id, i),
            )
            chunk_ids.append(chunk_id)

        # Extract and write graph
        full_text = "\n\n".join(texts)
        extraction = extract_from_text(full_text)
        graph_result = await write_extraction_results(
            extraction, chunk_id=chunk_ids[0] if chunk_ids else None, space=space,
        )

        # Update document
        await execute(
            """
            UPDATE documents
            SET status = 'done', chunks_created = %s, entities_found = %s,
                relationships_found = %s, finished_at = now()
            WHERE id = %s
            """,
            (len(chunk_ids), len(graph_result.get("entities", [])), len(graph_result.get("relationships", [])), doc_id),
        )

        return {
            "document_id": doc_id,
            "source_id": source_id,
            "chunks_created": len(chunk_ids),
            "entities_found": len(graph_result.get("entities", [])),
            "relationships_found": len(graph_result.get("relationships", [])),
            "chunk_ids": chunk_ids,
        }

    except Exception as e:
        await execute(
            "UPDATE documents SET status = 'error', error_message = %s WHERE id = %s",
            (str(e), doc_id),
        )
        raise IngestionError(f"File ingestion failed: {e}") from e


async def get_document(doc_id: str) -> dict | None:
    """Get document processing status."""
    return await fetch_one("SELECT * FROM documents WHERE id = %s", (doc_id,))


async def list_documents(limit: int = 50) -> list[dict]:
    """List recent documents."""
    from brain.core.db import fetch_all as _fetch_all
    rows = await _fetch_all(
        "SELECT * FROM documents ORDER BY created_at DESC LIMIT %s", (limit,),
    )
    return [dict(r) for r in rows]


# === Helpers ===

async def _get_or_create_source(name: str, source_type: str) -> str:
    """Get or create a source record."""
    row = await fetch_one("SELECT id FROM sources WHERE name = %s AND type = %s", (name, source_type))
    if row:
        return row["id"]
    return await execute(
        "INSERT INTO sources (name, type) VALUES (%s, %s) RETURNING id",
        (name, source_type),
    )


async def _get_or_create_space(name: str) -> int:
    """Get or create a memory space."""
    row = await fetch_one("SELECT id FROM memory_spaces WHERE name = %s", (name,))
    if row:
        return row["id"]
    return await execute(
        "INSERT INTO memory_spaces (name) VALUES (%s) RETURNING id",
        (name,),
    )
