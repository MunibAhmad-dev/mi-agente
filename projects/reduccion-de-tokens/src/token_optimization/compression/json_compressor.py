"""Structural JSON compressor (spec §22).

Preserves: schema keys, identifiers, anomalies. Aggregates duplicate array
elements and truncates very long arrays/strings, always leaving a
`__recoverable__` marker with the pointer to the original in the shadow store.
Output is always valid JSON.
"""
from __future__ import annotations

import json
from typing import Any, Optional

from ..core.ir import ContextItem, RiskLevel
from .base import Compressor, TokenFn

_MAX_ARRAY = 12      # keep head+tail of larger arrays
_HEAD, _TAIL = 3, 1
_MAX_STR = 2_000     # truncate longer strings inside the document


class JsonCompressor(Compressor):
    name = "json_structural"
    content_types = ("json",)

    def _compress_one(self, item: ContextItem, token_fn: TokenFn, budget: Optional[int]) -> str:
        if item.risk == RiskLevel.CRITICAL:
            return item.content
        try:
            data = json.loads(item.content)
        except (json.JSONDecodeError, ValueError):
            return item.content
        pointer = item.retrieval_pointer or item.hash
        compressed = self._walk(data, pointer)
        return json.dumps(compressed, ensure_ascii=False, separators=(",", ":"))

    # -- internals ---------------------------------------------------------
    def _walk(self, node: Any, pointer: str, depth: int = 0) -> Any:
        if depth > 12:  # safety bound for pathological documents
            return node
        if isinstance(node, dict):
            out = {}
            for k, v in node.items():
                out[k] = self._walk(v, pointer, depth + 1)
            return out
        if isinstance(node, list):
            return self._compress_list(node, pointer, depth)
        if isinstance(node, str) and len(node) > _MAX_STR:
            return node[:_MAX_STR] + f" ...[__truncated__ recoverable:{pointer}]"
        return node

    def _compress_list(self, arr: list, pointer: str, depth: int) -> Any:
        if not arr:
            return arr
        # 1) exact-duplicate aggregation (keep order of first occurrence)
        seen: list[Any] = []
        dupes = 0
        for el in arr:
            if el in seen:
                dupes += 1
            else:
                seen.append(el)
        arr = seen
        # 2) length aggregation for long arrays
        if len(arr) > _MAX_ARRAY:
            head, tail = arr[:_HEAD], arr[-_TAIL:] if _TAIL else []
            omitted = len(arr) - _HEAD - len(tail)
            marker = {
                "__truncated_array__": True,
                "__omitted__": omitted,
                "__duplicate_elements_removed__": dupes,
                "__recoverable__": True,
                "__pointer__": pointer,
            }
            return [marker] + head + (tail if tail and _TAIL else [])
        if dupes:
            return {"__deduplicated_array__": True, "__duplicates_removed__": dupes,
                    "__recoverable__": True, "__pointer__": pointer, "items": arr}
        return [self._walk(el, pointer, depth + 1) for el in arr]
