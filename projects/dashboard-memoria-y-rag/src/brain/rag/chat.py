"""RAG chat pipeline — question → retrieval → context → LLM → response.

Supports both JSON response and SSE streaming.
"""

from __future__ import annotations

import json
import re
import time
from typing import Any, AsyncGenerator

from brain.config import get_settings
from brain.logging_config import get_logger
from brain.rag.search import hybrid_search
from brain.rag.context import build_context

logger = get_logger("brain.rag.chat")


async def _call_llm_stream(messages: list[dict], model: str, base_url: str) -> AsyncGenerator[str, None]:
    """Stream tokens from LLM provider (Ollama or OpenAI-compatible)."""
    import httpx

    settings = get_settings()
    url = f"{base_url}/api/chat" if "11434" in base_url else f"{base_url}/v1/chat/completions"

    # Build request based on provider
    if "11434" in base_url:
        # Ollama native API
        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
        }
    else:
        # OpenAI-compatible API
        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "temperature": settings.llm.temperature,
            "max_tokens": settings.llm.max_tokens,
        }

    headers = {}
    if settings.llm.api_key:
        headers["Authorization"] = f"Bearer {settings.llm.api_key}"

    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream("POST", url, json=payload, headers=headers) as response:
            async for line in response.aiter_lines():
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    if "11434" in base_url:
                        # Ollama format
                        if data.get("done"):
                            break
                        content = data.get("message", {}).get("content", "")
                        if content:
                            yield content
                    else:
                        # OpenAI format
                        delta = data.get("choices", [{}])[0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            yield content
                except json.JSONDecodeError:
                    continue


def strip_thinking_tags(text: str) -> str:
    """Remove <think>...</think> blocks from LLM responses (Qwen3.5 etc)."""
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


async def rag_chat(
    query: str,
    history: list[dict[str, str]] | None = None,
    space: str | None = None,
    stream: bool = False,
) -> dict | AsyncGenerator[str, None]:
    """Full RAG chat pipeline.

    1. Hybrid search for relevant chunks
    2. Build context with token budget
    3. Call LLM
    4. Return answer with sources

    For stream=True, returns an async generator yielding SSE events.
    """
    settings = get_settings()
    start = time.perf_counter()

    # 1. Retrieve
    search_result = await hybrid_search(query, space=space, limit=10)
    chunks = search_result["results"]
    diagnostics = search_result["diagnostics"]

    # 2. Build context
    context = build_context(
        query=query,
        chunks=chunks,
        history=history or [],
        max_total_tokens=6000,
    )

    # 3. Log retrieval
    logger.info(
        "rag_retrieval",
        query=query,
        chunks_found=len(chunks),
        token_usage=context["token_usage"],
    )

    if stream:
        return _rag_chat_stream(query, context, diagnostics, settings, start)
    else:
        return await _rag_chat_json(query, context, diagnostics, settings, start)


async def _rag_chat_json(
    query: str,
    context: dict,
    diagnostics: dict,
    settings,
    start: float,
) -> dict:
    """Non-streaming RAG chat — return complete response."""
    try:
        response_text = ""
        async for token in _call_llm_stream(
            context["messages"],
            model=settings.llm.model,
            base_url=settings.llm.base_url,
        ):
            response_text += token

        response_text = strip_thinking_tags(response_text)

        # Build source citations
        sources = []
        for i, chunk in enumerate(context["chunks_used"], 1):
            sources.append({
                "index": i,
                "content": chunk["content"][:200],
                "source_name": chunk.get("source_name", "unknown"),
                "space": chunk.get("space", "default"),
                "similarity": chunk.get("rerank_score", chunk.get("similarity", 0)),
            })

        total_ms = round((time.perf_counter() - start) * 1000, 1)

        return {
            "answer": response_text,
            "sources": sources,
            "diagnostics": {**diagnostics, "total_ms": total_ms},
            "token_usage": context["token_usage"],
        }

    except Exception as e:
        logger.error("rag_chat_error", error=str(e))
        return {
            "answer": f"I encountered an error while processing your question: {e}",
            "sources": [],
            "diagnostics": diagnostics,
            "error": str(e),
        }


async def _rag_chat_stream(
    query: str,
    context: dict,
    diagnostics: dict,
    settings,
    start: float,
) -> AsyncGenerator[str, None]:
    """Streaming RAG chat — yield SSE events."""

    # First: send sources as JSON
    sources_data = []
    for i, chunk in enumerate(context["chunks_used"], 1):
        sources_data.append({
            "index": i,
            "content": chunk["content"][:200],
            "source_name": chunk.get("source_name", "unknown"),
            "space": chunk.get("space", "default"),
        })

    yield f"data: {json.dumps({'type': 'sources', 'sources': sources_data})}\n\n"

    # Then: stream answer tokens
    try:
        full_response = ""
        async for token in _call_llm_stream(
            context["messages"],
            model=settings.llm.model,
            base_url=settings.llm.base_url,
        ):
            full_response += token
            yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

        cleaned = strip_thinking_tags(full_response)
        total_ms = round((time.perf_counter() - start) * 1000, 1)

        # Send final metadata
        yield f"data: {json.dumps({'type': 'done', 'total_ms': total_ms, 'token_usage': context['token_usage']})}\n\n"

    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
