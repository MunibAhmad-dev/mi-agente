"""Five-level memory model (spec §9).

L0 active context, L1 compressed context, L2 structured facts, L3 archive
(shadow store), L4 external retrieval. Items move between levels by value,
age and budget. Level assignment is a decision the orchestrator can explain.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from ..core.ir import ContextItem, Role
from ..core.information_value import InformationValueEngine


@dataclass
class LevelAssignment:
    item_id: str
    level: int
    reason: str


@dataclass
class MemoryLevels:
    L0_active: list = field(default_factory=list)
    L1_compressed: list = field(default_factory=list)
    L2_facts: list = field(default_factory=list)
    L3_archive: list = field(default_factory=list)
    L4_external: list = field(default_factory=list)

    def all_items(self) -> list:
        return self.L0_active + self.L1_compressed + self.L2_facts + self.L3_archive + self.L4_external


class LevelManager:
    def __init__(self, token_fn, value_engine: InformationValueEngine | None = None) -> None:
        self.token_fn = token_fn
        self.value_engine = value_engine or InformationValueEngine()

    def assign(self, items: list[ContextItem], budget_tokens: int, query: str = "") -> tuple[MemoryLevels, list[LevelAssignment]]:
        self.value_engine.observe(items)
        levels = MemoryLevels()
        assignments: list[LevelAssignment] = []
        used = 0
        for item in sorted(items, key=lambda x: -self.value_engine.score(x, query=query)):
            v = self.value_engine.score(item, query=query)
            t = self.token_fn(item.content)
            if item.role in (Role.SYSTEM, Role.DEVELOPER) or v >= 0.55:
                level, reason = 0, "high value / instructions"
            elif v >= 0.35:
                # mid value: keep compressed form if already compressed, else active if budget allows
                if item.compression_state == "raw" and used + t <= budget_tokens:
                    level, reason = 0, "mid value, budget allows"
                else:
                    level, reason = 1, "mid value, compressed"
            elif item.content_type.value == "json" or self._looks_like_fact(item.content):
                level, reason = 2, "structured fact candidate"
            elif item.retrieval_pointer or item.compression_state in ("externalized", "compressed"):
                level, reason = 3, "archived with pointer"
            else:
                level, reason = 4, "external retrieval candidate"
            getattr(levels, f"L{level}_{'active' if level == 0 else 'compressed' if level == 1 else 'facts' if level == 2 else 'archive' if level == 3 else 'external'}").append(item)
            assignments.append(LevelAssignment(item.id, level, reason))
            if level in (0, 1):
                used += t
        return levels, assignments

    @staticmethod
    def _looks_like_fact(content: str) -> bool:
        head = content.strip().lower()
        return any(head.startswith(p) for p in ("user prefers", "project uses", "decision:", "constraint:", "the api key", "name:", "version:"))
