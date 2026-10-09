"""Context Graph + Contradiction Engine (spec §55, §57).

Edges are persisted through the shadow store; contradiction detection is a
deterministic, local scan: same metric claimed with different values across
items (e.g. "timeout 30s" vs "timeout was reduced to 15s"). It never merges
incompatible states; it surfaces them so the orchestrator/packer can prefer
the newest claim and keep both recoverable.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from .core.ir import ContextItem

# metric word ... (up to 24 non-digit chars) ... number [unit]
_CLAIM = re.compile(
    r"\b(timeout|retries|retry|limit|quota|budget|batch|max|minimum|port|workers)\b"
    r"[^\d\n]{0,24}?(\d+(?:\.\d+)?)\s*(ms|s|sec|seconds|%|mb|gb|tokens)?\b",
    re.IGNORECASE,
)
# explicit change language => the claim supersedes older values
_SUPERSEDES = re.compile(
    r"\b(reduced to|increased to|changed to|now uses|now set to|bumped to)\b", re.IGNORECASE
)
_DATE = re.compile(r"\b\d{4}-\d{2}-\d{2}\b|\bv\d+\.\d+\b")


@dataclass
class Contradiction:
    metric: str
    value_a: float
    value_b: float
    item_a: str
    item_b: str
    newer_item: str  # heuristic: the item with change-language / version marker
    detail: str


class ContextGraph:
    """In-memory edge index; use ShadowContextStore.add_edge for persistence."""

    def __init__(self) -> None:
        self._edges: dict[str, list[tuple[str, str]]] = {}

    def add_edge(self, src_id: str, relation: str, dst_id: str) -> None:
        relations = ("depends_on", "derived_from", "contradicts", "duplicates",
                     "supports", "supersedes", "required_by")
        if relation not in relations:
            raise ValueError(f"unknown relation: {relation}")
        self._edges.setdefault(src_id, []).append((relation, dst_id))

    def edges_from(self, src_id: str) -> list[tuple[str, str]]:
        return list(self._edges.get(src_id, []))

    def neighbors(self, src_id: str, relation: str | None = None) -> list[str]:
        return [d for r, d in self._edges.get(src_id, []) if relation is None or r == relation]


def detect_contradictions(items: list[ContextItem]) -> list[Contradiction]:
    claims: list[tuple[str, float, str, str]] = []  # (metric, value, item_id, raw)
    out: list[Contradiction] = []
    for it in items:
        seen_in_item: set[tuple[str, float]] = set()
        for m in _CLAIM.finditer(it.content):
            metric = m.group(1).lower()
            value = float(m.group(2))
            if (metric, value) in seen_in_item:
                continue
            seen_in_item.add((metric, value))
            claims.append((metric, value, it.id, m.group(0)))
    for i in range(len(claims)):
        for j in range(i + 1, len(claims)):
            ma, va, ia, raw_a = claims[i]
            mb, vb, ib, raw_b = claims[j]
            if ma != mb or va == vb or ia == ib:
                continue
            item_a = next((x for x in items if x.id == ia), None)
            item_b = next((x for x in items if x.id == ib), None)
            newer = _newer_hint(item_a, item_b)
            out.append(Contradiction(
                metric=ma, value_a=va, value_b=vb, item_a=ia, item_b=ib,
                newer_item=newer,
                detail=f"{ma}: {va:g} ({ia}) vs {vb:g} ({ib})",
            ))
    # dedupe symmetric pairs per metric
    seen: set[tuple] = set()
    unique: list[Contradiction] = []
    for c in out:
        key = (c.metric, frozenset((c.item_a, c.item_b)))
        if key not in seen:
            seen.add(key)
            unique.append(c)
    return unique[:50]


def _newer_hint(a: ContextItem | None, b: ContextItem | None) -> str:
    def score(it: ContextItem | None) -> tuple[float, float]:
        if it is None:
            return (0.0, 0.0)
        s = 1.0 if _SUPERSEDES.search(it.content) else 0.0
        s += 0.5 if _DATE.search(it.content) else 0.0
        return (s, it.timestamp)

    sa, sb = score(a), score(b)
    if sa >= sb:
        return a.id if a else ""
    return b.id if b else ""
