"""Document adapters — register and select the right adapter for each format."""

from __future__ import annotations

from brain.documents.adapters.base import SourceAdapter, RawChunk
from brain.documents.adapters.markdown import MarkdownAdapter
from brain.documents.adapters.plaintext import PlainTextAdapter

# Registry of all adapters
ADAPTERS: list[SourceAdapter] = [
    MarkdownAdapter(),
    PlainTextAdapter(),
]


def get_adapter(filename: str) -> SourceAdapter | None:
    """Select the best adapter for a given filename."""
    for adapter in ADAPTERS:
        if adapter.can_handle(filename):
            return adapter
    return None


def list_adapters() -> list[dict]:
    """List all registered adapters."""
    return [
        {
            "name": a.name,
            "extensions": a.supported_extensions,
        }
        for a in ADAPTERS
    ]


__all__ = ["SourceAdapter", "RawChunk", "get_adapter", "list_adapters", "ADAPTERS"]
