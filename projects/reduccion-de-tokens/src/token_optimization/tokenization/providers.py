"""Token counting providers and Model Profile Registry (spec §17).

Production rule: tokens are counted with the real tokenizer of the target model
when available (tiktoken for OpenAI-family encodings). A character-based
estimator exists ONLY as an explicitly-flagged fallback (`exact=False`) and is
never used silently for benchmark claims.
"""
from __future__ import annotations

import threading
from dataclasses import dataclass, field


@dataclass
class ModelProfile:
    name: str
    provider: str
    encoding: str  # tiktoken encoding name, or "char4" for the estimator
    context_window: int
    input_price_per_mtok: float
    output_price_per_mtok: float
    tokenizer_is_exact: bool
    cache_aware: bool = False
    compression_tolerance: float = 0.5  # empirical prior; validated per task by the lab
    notes: str = ""


class TiktokenProvider:
    """Exact counting for OpenAI-family encodings. Thread-safe, lazily loaded."""

    def __init__(self, encoding: str = "o200k_base") -> None:
        self.encoding_name = encoding
        self._enc = None
        self._lock = threading.Lock()
        self.exact = True

    def _get(self):
        if self._enc is None:
            with self._lock:
                if self._enc is None:
                    import tiktoken

                    self._enc = tiktoken.get_encoding(self.encoding_name)
        return self._enc

    def count(self, text: str) -> int:
        if not text:
            return 0
        return len(self._get().encode(text, disallowed_special=()))


class CharQuartetProvider:
    """Fallback estimator (~4 chars/token). Explicitly inexact."""

    exact = False

    def __init__(self, chars_per_token: float = 4.0) -> None:
        self.chars_per_token = max(1.0, chars_per_token)

    def count(self, text: str) -> int:
        if not text:
            return 0
        import math

        return max(1, math.ceil(len(text) / self.chars_per_token))


def get_provider(encoding: str) -> TiktokenProvider | CharQuartetProvider:
    """Return an exact provider if tiktoken + encoding are available, else the flagged estimator."""
    try:
        p = TiktokenProvider(encoding)
        p.count("ping")  # force load now so failures surface here, not mid-run
        return p
    except Exception:
        q = CharQuartetProvider()
        return q


class TokenCounter:
    """Facade used by the whole engine: `count(text)`."""

    def __init__(self, encoding: str = "o200k_base") -> None:
        self.encoding = encoding
        self._provider = get_provider(encoding)
        self._cache: dict[str, int] = {}
        self._lock = threading.Lock()

    @property
    def exact(self) -> bool:
        return self._provider.exact

    def count(self, text: str) -> int:
        if not text:
            return 0
        with self._lock:
            hit = self._cache.get(text)
        if hit is not None:
            return hit
        n = self._provider.count(text)
        with self._lock:
            if len(self._cache) < 100_000:
                self._cache[text] = n
        return n


class ModelProfileRegistry:
    """Reference profiles. Prices are configurable reference values, not quotes."""

    def __init__(self) -> None:
        self._profiles: dict[str, ModelProfile] = {}
        self._register_defaults()

    def _register_defaults(self) -> None:
        defaults = [
            ModelProfile("gpt-4o", "openai", "o200k_base", 128_000, 2.50, 10.00, True, cache_aware=True,
                         notes="Exact tiktoken counting"),
            ModelProfile("gpt-4o-mini", "openai", "o200k_base", 128_000, 0.15, 0.60, True, cache_aware=True),
            ModelProfile("gpt-4.1", "openai", "o200k_base", 1_000_000, 2.00, 8.00, True, cache_aware=True),
            ModelProfile("o4-mini", "openai", "o200k_base", 200_000, 1.10, 4.40, True, cache_aware=True),
            ModelProfile("claude-3-7-sonnet", "anthropic", "cl100k_base", 200_000, 3.00, 15.00, False,
                         notes="Approximate counting with cl100k; Anthropic tokenizer is not public"),
            ModelProfile("deepseek-chat", "deepseek", "cl100k_base", 128_000, 0.27, 1.10, False,
                         notes="Approximate counting"),
            ModelProfile("llama-3.1-8b-local", "ollama", "char4", 128_000, 0.0, 0.0, False,
                         notes="Local model: monetary cost 0; latency still measured"),
        ]
        for p in defaults:
            self._profiles[p.name] = p

    def get(self, name: str) -> ModelProfile:
        if name in self._profiles:
            return self._profiles[name]
        # accept provider/model syntax
        short = name.split("/")[-1]
        if short in self._profiles:
            return self._profiles[short]
        raise KeyError(f"unknown model profile: {name}")

    def register(self, profile: ModelProfile) -> None:
        self._profiles[profile.name] = profile

    def names(self) -> list[str]:
        return sorted(self._profiles)

    def counter_for(self, name: str) -> TokenCounter:
        prof = self.get(name)
        return TokenCounter(prof.encoding)
