"""Document API router — upload, ingest, status."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, UploadFile, File, Form

from brain.documents.pipeline import ingest_text, ingest_file, get_document
from brain.core.exceptions import IngestionError
from brain.logging_config import get_logger

logger = get_logger("brain.api.routers.documents")

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.post("/ingest/text", status_code=201)
async def api_ingest_text(
    content: str = Form(...),
    source_name: str = Form(default="paste"),
    space: str = Form(default="default"),
) -> dict:
    """Ingest plain text content directly."""
    try:
        return await ingest_text(
            content=content,
            source_name=source_name,
            source_type="paste",
            space=space,
        )
    except IngestionError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ingest/file", status_code=201)
async def api_ingest_file(
    file: UploadFile = File(...),
    space: str = Form(default="default"),
) -> dict:
    """Upload and ingest a file."""
    try:
        content = await file.read()
        if len(content) > 25 * 1024 * 1024:  # 25MB limit
            raise HTTPException(status_code=413, detail="File too large (max 25MB)")

        return await ingest_file(
            file_content=content,
            filename=file.filename or "unknown",
            space=space,
        )
    except IngestionError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")


@router.get("/{doc_id}")
async def api_get_document(doc_id: str) -> dict:
    """Get document processing status."""
    doc = await get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return dict(doc)
