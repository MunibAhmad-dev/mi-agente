"""Deduplication engine (spec §25): exact + near duplicates, provenance preserved.

The originals of removed duplicates remain in the shadow store; here we only
record which id was dropped in favor of which survivor.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

_WORD_RE = re.compile(r"\w{3,}", re.UNICODE)


def _shingles(text: str, k: int = 5) -> set:
    words = _WORD_RE.findall(text.lower())
    if len(words) < k:
        return {" ".join(words)} if words else set()
    return {" ".join(words[i: i + k]) for i in range(len(words) - k + 1)}


def jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0


@dataclass
class DedupResult:
    kept: list = field(default_factory=list)
    removed: list = field(default_factory=list)  # (dropped_id, kept_id, similarity)


class DeduplicationEngine:
    def __init__(self, exact_threshold: float = 1.0, near_threshold: float = 0.85) -> None:
        self.near_threshold = near_threshold
        self.exact_threshold = exact_threshold

    def deduplicate(self, items) -> DedupResult:
        result = DedupResult()
        kept_shingles: list[tuple[object, set]] = []
        for it in items:
            sig = _shingles(it.content)
            best_id, best_sim = None, 0.0
            for kept_item, kept_sig in kept_shingles:
                sim = jaccard(sig, kept_sig)
                if sim > best_sim:
                    best_id, best_sim = kept_item.id, sim
            exact_dup = any(it.hash == k.hash for k, _ in kept_shingles)
            if exact_dup or best_sim >= self.near_threshold:
                result.removed.append((it.id, best_id or "?", round(best_sim, 4)))
            else:
                result.kept.append(it)
                kept_shingles.append((it, sig))
        return result
