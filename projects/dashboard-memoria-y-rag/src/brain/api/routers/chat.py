"""RAG Chat API router — chat with the Brain using retrieval-augmented generation."""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from brain.rag.chat import rag_chat
from brain.logging_config import get_logger

logger = get_logger("brain.api.routers.chat")

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("")
async def chat_json(
    query: str,
    space: str | None = None,
    history: list[dict] | None = None,
) -> dict:
    """RAG chat — returns complete JSON response with answer and sources."""
    result = await rag_chat(
        query=query,
        history=history or [],
        space=space,
        stream=False,
    )
    return result


@router.post("/stream")
async def chat_stream(
    query: str,
    space: str | None = None,
    history: list[dict] | None = None,
) -> StreamingResponse:
    """RAG chat — streams response via Server-Sent Events (SSE).

    SSE event types:
    - sources: {type: "sources", sources: [...]}
    - token: {type: "token", content: "..."}
    - done: {type: "done", total_ms: ..., token_usage: {...}}
    - error: {type: "error", error: "..."}
    """
    generator = await rag_chat(
        query=query,
        history=history or [],
        space=space,
        stream=True,
    )

    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
