"""Shared base for content-aware compressors (spec §12, §20-22).

All compressors are deterministic, local and reversible: they never destroy
information because originals are externalized to the shadow store before any
compression runs.
"""
from __future__ import annotations

import time
from typing import Callable, Optional, Protocol, Sequence

from ..core.interfaces import CompressionResult, Strategy
from ..core.ir import ContextItem

TokenFn = Callable[[str], int]


class Compressor:
    """Base class: name + compress(). Subclasses implement `_compress_one`."""

    name: str = "base"
    strategy: Strategy = Strategy.COMPRESS
    content_types: tuple = ()  # empty = accepts any

    def accepts(self, item: ContextItem) -> bool:
        if self.content_types and item.content_type.value not in self.content_types:
            return False
        return True

    def compress(
        self,
        items: Sequence[ContextItem],
        token_fn: Optional[TokenFn] = None,
        budget: Optional[int] = None,
    ) -> CompressionResult:
        token_fn = token_fn or (lambda s: max(1, len(s) // 4))
        t0 = time.perf_counter()
        out_items: list[ContextItem] = []
        original_tokens = 0
        compressed_tokens = 0
        changed = 0
        for item in items:
            before = token_fn(item.content)
            original_tokens += before
            new_content = item.content
            if self.accepts(item):
                try:
                    new_content = self._compress_one(item, token_fn, budget)
                except Exception as exc:  # failure handling (spec §42): keep original
                    new_content = item.content
                    out_items.append(item)
                    compressed_tokens += before
                    self._last_error = f"{type(exc).__name__}: {exc}"
                    continue
            after = token_fn(new_content)
            compressed_tokens += after
            if new_content != item.content:
                changed += 1
                out_items.append(
                    item.clone_with(
                        content=new_content,
                        compression_state=f"compressed:{self.name}",
                        retrieval_pointer=item.hash,
                    )
                )
            else:
                out_items.append(item)
        elapsed = (time.perf_counter() - t0) * 1000.0
        return CompressionResult(
            items=out_items,
            strategy=self.strategy,
            method=self.name,
            original_tokens=original_tokens,
            compressed_tokens=compressed_tokens,
            compression_latency_ms=round(elapsed, 3),
            ok=compressed_tokens <= original_tokens,
            metadata={"changed_items": changed},
        )

    def _compress_one(self, item: ContextItem, token_fn: TokenFn, budget: Optional[int]) -> str:
        raise NotImplementedError
