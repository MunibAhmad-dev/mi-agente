"""Context assembly — build LLM prompt with token budget management.

Handles:
- Conversation history trimming
- Chunk trimming by similarity
- Oversized chunk truncation
- Source citation formatting
"""

from __future__ import annotations

import re
from typing import Any


# Approximate tokens per word (English)
TOKENS_PER_WORD = 1.3


def estimate_tokens(text: str) -> int:
    """Estimate token count for text."""
    return int(len(text.split()) * TOKENS_PER_WORD)


def trim_history(
    history: list[dict[str, str]],
    max_tokens: int = 2000,
) -> list[dict[str, str]]:
    """Trim conversation history to fit within token budget.

    Keeps the most recent messages first.
    """
    trimmed = []
    total_tokens = 0

    for msg in reversed(history):
        msg_tokens = estimate_tokens(msg.get("content", ""))
        if total_tokens + msg_tokens > max_tokens:
            break
        trimmed.insert(0, msg)
        total_tokens += msg_tokens

    return trimmed


def trim_chunks(
    chunks: list[dict],
    max_tokens: int = 3000,
    content_key: str = "content",
) -> list[dict]:
    """Trim chunks by similarity score, fitting within token budget."""
    sorted_chunks = sorted(
        chunks,
        key=lambda c: c.get("rerank_score", c.get("final_score", c.get("similarity", 0))),
        reverse=True,
    )

    trimmed = []
    total_tokens = 0

    for chunk in sorted_chunks:
        chunk_tokens = estimate_tokens(chunk.get(content_key, ""))
        if chunk_tokens > 500:
            # Truncate oversized chunks
            words = chunk.get(content_key, "").split()
            max_words = int(500 / TOKENS_PER_WORD)
            chunk = {**chunk, content_key: " ".join(words[:max_words]) + "..."}
            chunk_tokens = 500

        if total_tokens + chunk_tokens > max_tokens:
            break

        trimmed.append(chunk)
        total_tokens += chunk_tokens

    return trimmed


def format_sources(chunks: list[dict]) -> str:
    """Format chunks as numbered sources for the LLM prompt."""
    lines = []
    for i, chunk in enumerate(chunks, 1):
        source = chunk.get("source_name", "unknown")
        space = chunk.get("space", "default")
        content = chunk.get("content", "")
        similarity = chunk.get("rerank_score", chunk.get("final_score", chunk.get("similarity", 0)))

        lines.append(f"[{i}] (source: {source}, space: {space}, score: {similarity:.3f})")
        lines.append(content)
        lines.append("")

    return "\n".join(lines)


def build_context(
    query: str,
    chunks: list[dict],
    history: list[dict[str, str]] | None = None,
    system_prompt: str | None = None,
    max_total_tokens: int = 6000,
    max_history_tokens: int = 2000,
    max_context_tokens: int = 3000,
) -> dict[str, Any]:
    """Build complete LLM context with token budget.

    Returns dict with:
        - messages: list of {role, content} for chat completion
        - sources: formatted source citations
        - token_usage: breakdown of token allocation
    """
    history = history or []

    # System prompt
    if system_prompt is None:
        system_prompt = (
            "You are Brain, an AI knowledge and memory system. "
            "Answer questions based on the provided context. "
            "Always cite your sources using [1], [2], etc. "
            "If the context doesn't contain the answer, say so honestly."
        )

    # Allocate budgets
    system_tokens = estimate_tokens(system_prompt)
    remaining = max_total_tokens - system_tokens

    history_budget = min(max_history_tokens, remaining // 3)
    context_budget = min(max_context_tokens, remaining - history_budget)

    # Trim
    trimmed_history = trim_history(history, max_tokens=history_budget)
    trimmed_chunks = trim_chunks(chunks, max_tokens=context_budget)

    # Format sources
    sources_text = format_sources(trimmed_chunks)

    # Build messages
    messages = [{"role": "system", "content": system_prompt}]

    for msg in trimmed_history:
        messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})

    # Add context + question
    user_message = f"Context:\n{sources_text}\n\nQuestion: {query}"
    messages.append({"role": "user", "content": user_message})

    # Token usage tracking
    token_usage = {
        "system": system_tokens,
        "history": estimate_tokens(" ".join(m.get("content", "") for m in trimmed_history)),
        "context": estimate_tokens(sources_text),
        "total": system_tokens + estimate_tokens(user_message),
    }

    return {
        "messages": messages,
        "sources": sources_text,
        "chunks_used": trimmed_chunks,
        "token_usage": token_usage,
    }
