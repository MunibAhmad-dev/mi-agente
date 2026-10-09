"""Information Value Engine (spec §7).

InformationValue = f(relevance, necessity, uniqueness, dependency, future_need, risk)
Not a single universal score: factors are combined per item with role/type awareness.
"""
from __future__ import annotations

import math
import re
from collections import Counter

from .ir import ContextItem, Role

_WORD_RE = re.compile(r"\w{3,}", re.UNICODE)


class InformationValueEngine:
    """Scores items; higher value = keep closer to the active context."""

    def __init__(self) -> None:
        self._seen_hashes: Counter = Counter()

    def observe(self, items) -> None:
        for it in items:
            self._seen_hashes[it.hash] += 1

    def score(self, item: ContextItem, query: str = "", recency_half_life: float = 1800.0) -> float:
        factors = self.explain(item, query=query, recency_half_life=recency_half_life)
        return factors["total"]

    def explain(self, item: ContextItem, query: str = "", recency_half_life: float = 1800.0) -> dict:
        # relevance: lexical overlap with the current query/objective
        rel = 0.0
        if query:
            q_terms = set(_WORD_RE.findall(query.lower()))
            i_terms = set(_WORD_RE.findall(item.content.lower()))
            if q_terms:
                rel = len(q_terms & i_terms) / len(q_terms)

        # necessity: instructions and system/developer context are necessary
        necessity = 0.0
        if item.role in (Role.SYSTEM, Role.DEVELOPER):
            necessity = 1.0
        elif item.role == Role.USER:
            necessity = 0.8
        elif item.content_type.value in ("code", "json"):
            necessity = 0.6

        # uniqueness: penalize duplicated content
        dup_count = self._seen_hashes.get(item.hash, 1)
        uniqueness = 1.0 / dup_count

        # dependency: items others depend on are valuable
        dependency = min(1.0, 0.3 + 0.2 * len(item.dependencies) + (0.4 if item.role == Role.TOOL else 0.0))

        # future need: heuristic decay by age (JIT context, spec §10)
        age = max(0.0, _now() - item.timestamp)
        future_need = math.pow(0.5, age / max(1.0, recency_half_life))
        if item.role in (Role.SYSTEM, Role.DEVELOPER):
            future_need = max(future_need, 0.9)

        # risk: critical content must not be silently dropped
        risk_bonus = {"low": 0.0, "medium": 0.05, "high": 0.1, "critical": 0.2}[item.risk.value]

        total = (
            0.30 * rel
            + 0.25 * necessity
            + 0.15 * uniqueness
            + 0.10 * dependency
            + 0.15 * future_need
            + risk_bonus
        )
        return {
            "relevance": round(rel, 4),
            "necessity": round(necessity, 4),
            "uniqueness": round(uniqueness, 4),
            "dependency": round(dependency, 4),
            "future_need": round(future_need, 4),
            "risk_bonus": risk_bonus,
            "total": round(min(1.0, total), 4),
        }


def _now() -> float:
    import time

    return time.time()
