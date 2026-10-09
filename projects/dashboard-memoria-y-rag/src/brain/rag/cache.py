"""In-memory search cache with TTL — avoid repeated expensive embedding+search."""

from __future__ import annotations

import hashlib
import time
from collections import OrderedDict
from typing import Any

from brain.logging_config import get_logger

logger = get_logger("brain.rag.cache")


class SearchCache:
    """LRU cache with TTL for search results."""

    def __init__(self, max_size: int = 256, ttl_seconds: int = 300):
        self._cache: OrderedDict[str, tuple[float, Any]] = OrderedDict()
        self._max_size = max_size
        self._ttl = ttl_seconds
        self._hits = 0
        self._misses = 0

    def _make_key(self, query: str, space: str | None, limit: int) -> str:
        raw = f"{query}|{space or ''}|{limit}"
        return hashlib.md5(raw.encode()).hexdigest()

    def get(self, query: str, space: str | None = None, limit: int = 10) -> Any | None:
        key = self._make_key(query, space, limit)
        if key in self._cache:
            ts, value = self._cache[key]
            if time.time() - ts < self._ttl:
                self._cache.move_to_end(key)
                self._hits += 1
                return value
            else:
                del self._cache[key]
        self._misses += 1
        return None

    def set(self, query: str, space: str | None, limit: int, value: Any) -> None:
        key = self._make_key(query, space, limit)
        if key in self._cache:
            del self._cache[key]
        elif len(self._cache) >= self._max_size:
            self._cache.popitem(last=False)
        self._cache[key] = (time.time(), value)

    def stats(self) -> dict:
        total = self._hits + self._misses
        return {
            "size": len(self._cache),
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": round(self._hits / total, 3) if total > 0 else 0,
        }

    def clear(self) -> None:
        self._cache.clear()
        self._hits = 0
        self._misses = 0


# Global cache instance
search_cache = SearchCache(max_size=256, ttl_seconds=300)
