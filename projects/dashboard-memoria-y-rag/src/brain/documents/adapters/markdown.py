"""Markdown adapter — parse .md files, splitting on headers."""

from __future__ import annotations

import re
from typing import Any

from brain.documents.adapters.base import RawChunk, SourceAdapter


class MarkdownAdapter(SourceAdapter):
    """Parse Markdown files with section-aware chunking."""

    @property
    def supported_extensions(self) -> list[str]:
        return [".md", ".markdown", ".mdx"]

    @property
    def name(self) -> str:
        return "markdown"

    async def parse(self, content: bytes, filename: str) -> list[RawChunk]:
        """Parse Markdown content, splitting on ## headers."""
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError:
            text = content.decode("latin-1")

        # Split on headers (## or ###)
        sections = re.split(r'(^#{1,3}\s+.+$)', text, flags=re.MULTILINE)

        chunks = []
        current_header = ""
        current_text = ""

        for part in sections:
            if re.match(r'^#{1,3}\s+', part):
                # Save previous section
                if current_text.strip():
                    chunks.extend(
                        self.chunk_text(
                            current_text.strip(),
                            metadata={"header": current_header, "filename": filename},
                        )
                    )
                current_header = part.strip()
                current_text = ""
            else:
                current_text += part

        # Last section
        if current_text.strip():
            chunks.extend(
                self.chunk_text(
                    current_text.strip(),
                    metadata={"header": current_header, "filename": filename},
                )
            )

        # If no headers found, just chunk the whole text
        if not chunks and text.strip():
            chunks = self.chunk_text(
                text.strip(),
                metadata={"filename": filename},
            )

        return chunks
