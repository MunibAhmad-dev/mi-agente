"""Plain text adapter — parse .txt and other plain text files."""

from __future__ import annotations

from brain.documents.adapters.base import RawChunk, SourceAdapter


class PlainTextAdapter(SourceAdapter):
    """Parse plain text files with paragraph-based chunking."""

    @property
    def supported_extensions(self) -> list[str]:
        return [".txt", ".log", ".csv", ".json", ".yaml", ".yml", ".toml", ".ini", ".cfg"]

    @property
    def name(self) -> str:
        return "plaintext"

    async def parse(self, content: bytes, filename: str) -> list[RawChunk]:
        """Parse plain text content into chunks."""
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError:
            text = content.decode("latin-1")

        # Split on double newlines (paragraphs)
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]

        if not paragraphs and text.strip():
            paragraphs = [text.strip()]

        chunks = []
        for para in paragraphs:
            chunks.extend(
                self.chunk_text(
                    para,
                    metadata={"filename": filename, "format": "plaintext"},
                )
            )

        return chunks
