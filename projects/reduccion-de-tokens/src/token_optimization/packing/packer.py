"""Context packing (spec §59): fit items to the model budget with role-aware ordering."""
from __future__ import annotations

from dataclasses import dataclass

from ..core.ir import ContextItem, Role
from ..core.information_value import InformationValueEngine

_ROLE_ORDER = {Role.SYSTEM: 0, Role.DEVELOPER: 1, Role.USER: 2, Role.TOOL: 3,
               Role.ASSISTANT: 4, Role.EXTERNAL: 5}


@dataclass
class PackedContext:
    items: list
    included_ids: list
    dropped_ids: list
    tokens: int
    budget: int


class ContextPacker:
    def __init__(self, token_fn) -> None:
        self.token_fn = token_fn
        self.value_engine = InformationValueEngine()

    def pack(self, items: list[ContextItem], budget: int, query: str = "") -> PackedContext:
        self.value_engine.observe(items)
        scored = sorted(
            items,
            key=lambda it: (
                _ROLE_ORDER.get(it.role, 9),
                -self.value_engine.score(it, query=query),
            ),
        )
        out: list[ContextItem] = []
        included: list[str] = []
        dropped: list[str] = []
        used = 0
        for it in scored:
            t = self.token_fn(it.content)
            # system/developer instructions are non-negotiable (spec §13): always included
            if it.role in (Role.SYSTEM, Role.DEVELOPER):
                out.append(it)
                included.append(it.id)
                used += t
                continue
            if used + t > budget:
                dropped.append(it.id)
                continue
            out.append(it)
            included.append(it.id)
            used += t
        # restore original arrival order inside the packed context
        order = {id(x): i for i, x in enumerate(items)}
        out.sort(key=lambda x: order.get(id(x), 1 << 30))
        return PackedContext(out, included, dropped, used, budget)
