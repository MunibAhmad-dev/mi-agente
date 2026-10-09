"""Conservative prose/text compressor (stage 5 of the cascade, spec §12).

Removes: repeated blank lines, exact duplicate lines and exact repeated
sentences within a line. Everything dropped remains in the shadow store.
"""
from __future__ import annotations

import re
from typing import Optional

from ..core.ir import ContextItem, RiskLevel
from .base import Compressor, TokenFn

_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+")


class TextDropCompressor(Compressor):
    name = "text_drop"
    content_types = ("text", "markdown", "search_results", "rag_chunk", "unknown")

    def _compress_one(self, item: ContextItem, token_fn: TokenFn, budget: Optional[int]) -> str:
        if item.risk == RiskLevel.CRITICAL:
            return item.content  # CRITICAL prose is preserved verbatim (spec §13)
        pointer = item.retrieval_pointer or item.hash
        lines = item.content.splitlines()
        out: list[str] = []
        seen_lines: dict[str, int] = {}
        seen_sentences: set[str] = set()
        dropped = 0
        blank_run = 0
        for line in lines:
            stripped = line.strip()
            if not stripped:
                blank_run += 1
                if blank_run > 1:
                    dropped += 1
                    continue
                out.append("")
                continue
            blank_run = 0
            if stripped in seen_lines:
                dropped += 1
                continue
            seen_lines[stripped] = 1
            # sentence-level dedup inside the line (repeated boilerplate)
            sentences = _SENT_SPLIT.split(stripped)
            if len(sentences) > 1:
                kept_sentences: list[str] = []
                for s in sentences:
                    key = s.strip().lower()
                    if key and key in seen_sentences:
                        dropped += 1
                        continue
                    if key:
                        seen_sentences.add(key)
                    kept_sentences.append(s)
                if kept_sentences:
                    line = " ".join(kept_sentences)
            out.append(line.rstrip())
        if dropped > 0:
            out.append(f"[{self.name}: {dropped} redundant fragments omitted; recoverable:{pointer}]")
        return "\n".join(out)
