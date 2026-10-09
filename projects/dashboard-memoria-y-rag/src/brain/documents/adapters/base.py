"""Base adapter interface — all document format adapters implement this."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class RawChunk:
    """A raw chunk extracted from a document before embedding."""
    content: str
    metadata: dict[str, Any] = field(default_factory=dict)
    chunk_index: int = 0
    start_offset: int = 0
    end_offset: int = 0


class SourceAdapter(ABC):
    """Abstract base class for document format adapters."""

    @property
    @abstractmethod
    def supported_extensions(self) -> list[str]:
        """File extensions this adapter handles."""
        ...

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable adapter name."""
        ...

    @abstractmethod
    async def parse(self, content: bytes, filename: str) -> list[RawChunk]:
        """Parse document content into raw chunks.

        Args:
            content: Raw file bytes
            filename: Original filename

        Returns:
            List of RawChunk objects
        """
        ...

    def can_handle(self, filename: str) -> bool:
        """Check if this adapter can handle the given filename."""
        ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        return ext in self.supported_extensions

    def chunk_text(
        self,
        text: str,
        max_words: int = 500,
        overlap: int = 50,
        metadata: dict[str, Any] | None = None,
    ) -> list[RawChunk]:
        """Split text into word-count-based chunks with overlap.

        Utility method available to all adapters.
        """
        words = text.split()
        chunks = []
        idx = 0

        while idx < len(words):
            chunk_words = words[idx: idx + max_words]
            chunk_text = " ".join(chunk_words)

            start = len(" ".join(words[:idx]))
            end = start + len(chunk_text)

            chunks.append(RawChunk(
                content=chunk_text.strip(),
                metadata=metadata or {},
                chunk_index=len(chunks),
                start_offset=start,
                end_offset=end,
            ))

            idx += max_words - overlap

        return chunks
