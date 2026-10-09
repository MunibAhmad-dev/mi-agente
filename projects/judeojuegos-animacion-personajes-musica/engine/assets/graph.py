"""Asset graph (Master Prompt §50, §51).

Typed relations between assets. When an asset changes, `impact()` finds every
transitive dependent and `regeneration_plan()` orders them so regeneration can
be partial — never regenerate what is untouched (§51).
"""

from __future__ import annotations

from collections import deque
from typing import Any

from sqlalchemy import select

from engine.kernel.models import AssetRelation

RELATIONS = ("derived_from", "references", "depends_on", "variant_of")


class AssetGraph:
    def __init__(self, session_factory) -> None:
        self.Session = session_factory

    def link(self, from_id: str, to_id: str, relation: str) -> dict:
        if relation not in RELATIONS:
            raise ValueError(f"relation must be one of {RELATIONS}")
        if from_id == to_id:
            raise ValueError("self-relations are not allowed")
        with self.Session() as s:
            if s.scalar(select(AssetRelation.id).where(
                AssetRelation.from_id == from_id, AssetRelation.to_id == to_id, AssetRelation.relation == relation
            )):
                raise ValueError("relation already exists")
            row = AssetRelation(from_id=from_id, to_id=to_id, relation=relation)
            s.add(row)
            s.commit()
            return {"id": row.id, "from_id": from_id, "to_id": to_id, "relation": relation}

    def unlink(self, from_id: str, to_id: str, relation: str) -> bool:
        with self.Session() as s:
            row = s.scalar(select(AssetRelation).where(
                AssetRelation.from_id == from_id, AssetRelation.to_id == to_id, AssetRelation.relation == relation
            ))
            if row is None:
                return False
            s.delete(row)
            s.commit()
            return True

    def links(self, asset_id: str, direction: str = "both") -> list[dict]:
        if direction not in ("in", "out", "both"):
            raise ValueError("direction must be in, out, or both")
        out: list[dict] = []
        with self.Session() as s:
            if direction in ("out", "both"):
                for r in s.scalars(select(AssetRelation).where(AssetRelation.from_id == asset_id)).all():
                    out.append({"id": r.id, "from_id": r.from_id, "to_id": r.to_id, "relation": r.relation, "direction": "out"})
            if direction in ("in", "both"):
                for r in s.scalars(select(AssetRelation).where(AssetRelation.to_id == asset_id)).all():
                    out.append({"id": r.id, "from_id": r.from_id, "to_id": r.to_id, "relation": r.relation, "direction": "in"})
        return out

    def _dependents_edges(self) -> dict[str, list[tuple[str, str]]]:
        """source -> [(dependent, relation)]: an edge (a -> b) means b consumes/derives
        from a, so a change in a affects b (and transitively whatever consumes b)."""
        with self.Session() as s:
            rows = s.scalars(select(AssetRelation)).all()
        edges: dict[str, list[tuple[str, str]]] = {}
        for r in rows:
            edges.setdefault(r.from_id, []).append((r.to_id, r.relation))
        return edges

    def impact(self, asset_id: str) -> list[dict[str, Any]]:
        """Transitive dependents of an asset, BFS with paths (cycle-safe)."""
        edges = self._dependents_edges()
        seen = {asset_id}
        out: list[dict[str, Any]] = []
        queue: deque[tuple[str, list[str]]] = deque([(asset_id, [asset_id])])
        while queue:
            current, path = queue.popleft()
            for dependent, relation in edges.get(current, []):
                if dependent in seen:
                    continue
                seen.add(dependent)
                out.append({"asset_id": dependent, "depth": len(path), "path": path + [dependent], "relation": relation})
                queue.append((dependent, path + [dependent]))
        out.sort(key=lambda d: (d["depth"], d["asset_id"]))
        return out

    def regeneration_plan(self, asset_id: str) -> list[dict[str, Any]]:
        """Ordered regeneration plan: near dependents first (they only need the
        changed asset); deeper ones regenerate after their own inputs."""
        return self.impact(asset_id)
