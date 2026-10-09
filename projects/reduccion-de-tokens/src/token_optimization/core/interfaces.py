"""Core interfaces (plugin architecture) for the Token Optimization Engine.

Every external technique (Headroom, Winnow, LLMLingua, ACON, ...) is expected to
be wrapped behind :class:`ContextCompressor`; the orchestrator never depends on a
concrete vendor implementation.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Protocol, runtime_checkable, Optional, Sequence


class Strategy(str, Enum):
    KEEP = "keep"
    DEDUP = "dedup"
    CACHE = "cache"
    SUMMARIZE = "summarize"
    STRUCTURE = "structure"
    COMPRESS = "compress"
    EXTERNALIZE = "externalize"
    RETRIEVE = "retrieve"
    REJECT = "reject"
    RECOVER = "recover"


@dataclass
class CompressionResult:
    """Outcome of a compressor run over a set of items."""

    items: list = field(default_factory=list)
    strategy: Strategy = Strategy.KEEP
    method: str = "none"
    original_tokens: int = 0
    compressed_tokens: int = 0
    compression_latency_ms: float = 0.0
    ok: bool = True
    error: str | None = None
    metadata: dict = field(default_factory=dict)

    @property
    def tokens_saved(self) -> int:
        return max(0, self.original_tokens - self.compressed_tokens)

    @property
    def compression_ratio(self) -> float:
        if self.original_tokens <= 0:
            return 1.0
        return self.compressed_tokens / self.original_tokens


@runtime_checkable
class ContextCompressor(Protocol):
    """A compressor transforms items, never destroys them (originals live in the store)."""

    name: str

    def compress(
        self,
        items: Sequence,
        token_fn=None,
        budget: Optional[int] = None,
    ) -> CompressionResult:  # pragma: no cover - interface
        ...


@runtime_checkable
class ContextRetriever(Protocol):
    def retrieve(self, query: str, k: int = 5) -> list:  # pragma: no cover
        ...


@runtime_checkable
class ContextClassifier(Protocol):
    def classify_content(self, content: str) -> str:  # pragma: no cover
        ...

    def classify_task(self, text: str) -> str:  # pragma: no cover
        ...


@runtime_checkable
class ContextScorer(Protocol):
    def score(self, item) -> float:  # pragma: no cover
        ...


@runtime_checkable
class FidelityEvaluator(Protocol):
    def check(self, original, compressed) -> tuple:  # pragma: no cover
        ...


@runtime_checkable
class ContextStore(Protocol):
    def put(self, item) -> str:  # pragma: no cover
        ...

    def get(self, item_id: str):  # pragma: no cover
        ...


@runtime_checkable
class TokenizerProvider(Protocol):
    def count(self, text: str) -> int:  # pragma: no cover
        ...


@runtime_checkable
class CompressionPolicy(Protocol):
    def decide(self, item, budget: Optional[int] = None) -> Strategy:  # pragma: no cover
        ...
