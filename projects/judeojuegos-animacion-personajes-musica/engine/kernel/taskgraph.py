"""DAG task graph (Master Prompt §7/§9).

A graph is a set of task specs plus directed edges (task -> depends_on).
Validation: no unknown ids, no self-loops, no cycles. Topological ordering is
stable (insertion order) so jobs are deterministic.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any


class GraphError(ValueError):
    pass


@dataclass(frozen=True)
class TaskSpec:
    id: str
    kind: str
    params: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class EdgeSpec:
    task: str
    depends_on: str


class TaskGraph:
    def __init__(self, tasks: list[TaskSpec], edges: list[EdgeSpec]) -> None:
        self.tasks = {t.id: t for t in tasks}
        self._order = [t.id for t in tasks]
        self.edges: dict[str, list[str]] = {t.id: [] for t in tasks}  # task -> deps
        for e in edges:
            if e.task not in self.tasks or e.depends_on not in self.tasks:
                raise GraphError(f"edge references unknown task: {e}")
            if e.task == e.depends_on:
                raise GraphError(f"self-loop on task {e.task}")
            if e.depends_on in self.edges[e.task]:
                continue
            self.edges[e.task].append(e.depends_on)
        self._check_cycles()

    def depends_on(self, task_id: str) -> list[str]:
        return list(self.edges[task_id])

    def topo_order(self) -> list[str]:
        """Stable topological order (insertion order for ties)."""
        indegree = {tid: 0 for tid in self._order}
        dependents: dict[str, list[str]] = {tid: [] for tid in self._order}
        for tid in self._order:
            for dep in self.edges[tid]:
                indegree[tid] += 1
                dependents[dep].append(tid)
        queue = [tid for tid in self._order if indegree[tid] == 0]
        out: list[str] = []
        while queue:
            tid = queue.pop(0)
            out.append(tid)
            for dependent in dependents[tid]:
                indegree[dependent] -= 1
                if indegree[dependent] == 0:
                    queue.append(dependent)
        return out

    def _check_cycles(self) -> None:
        if len(self.topo_order()) != len(self.tasks):
            raise GraphError("cycle detected in task graph")

    def all_artifacts_hashes(self, task_id: str, input_hashes: dict[str, list[str]]) -> list[str]:
        """Flattened, dependency-ordered input artifact hashes (for manifest hashing)."""
        out: list[str] = []
        for dep in self.depends_on(task_id):
            out.extend(input_hashes.get(dep, []))
        return out


def manifest_hash(kind: str, params: dict[str, Any], input_hashes: list[str]) -> str:
    """Content-based manifest: kind + canonical params + input artifact hashes.

    Reuse detection (Master Prompt §51/§9) compares these hashes, never names.
    """
    canonical = json.dumps(params, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    payload = f"{kind}\0{canonical}\0{','.join(sorted(input_hashes))}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()