"""TargetedRecovery (spec §15): minimal relevant expansion, never the whole document."""
from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Optional

from ..storage.store import ShadowContextStore
from ..observability import GLOBAL_METRICS, M_RECOVERIES, M_RECOVERY_TOKENS, T_RECOVERY_MS


@dataclass
class RecoveryResult:
    item_id: str
    scope: str  # "full" | "lines" | "json_field" | "search"
    content: str
    tokens_spent: int


class TargetedRecoverer:
    def __init__(self, store: ShadowContextStore, token_fn=None) -> None:
        self.store = store
        self.token_fn = token_fn or (lambda s: max(1, len(s) // 4))

    def recover(self, pointer: str, scope: str = "full", selector: str | None = None,
                start_line: int | None = None, end_line: int | None = None) -> RecoveryResult | None:
        t0 = time.perf_counter()
        stored = self.store.get_by_pointer(pointer) if pointer.startswith("shadow://") else self.store.get(pointer)
        if stored is None:
            return None
        content = stored.content
        if scope == "lines" and start_line is not None:
            lines = content.splitlines()
            end = end_line if end_line is not None else start_line
            content = "\n".join(lines[max(0, start_line - 1): end])
        elif scope == "json_field" and selector:
            content = self._extract_json_field(content, selector)
        tokens = self.token_fn(content)
        m = GLOBAL_METRICS
        m.inc(M_RECOVERIES)
        m.inc(M_RECOVERY_TOKENS, tokens)
        m.observe_ms(T_RECOVERY_MS, (time.perf_counter() - t0) * 1000.0)
        return RecoveryResult(
            item_id=stored.id,
            scope=scope,
            content=content,
            tokens_spent=tokens,
        )

    def search(self, query: str, k: int = 5, task_id: str | None = None) -> list[RecoveryResult]:
        hits = self.store.search(query, k=k, task_id=task_id)
        out = []
        for h in hits:
            out.append(RecoveryResult(h.id, "search", h.content, self.token_fn(h.content)))
        return out

    @staticmethod
    def _extract_json_field(content: str, selector: str) -> str:
        """selector: dotted path with optional [index], e.g. 'results[3].url'."""
        try:
            data = json.loads(content)
        except (json.JSONDecodeError, ValueError):
            return content
        cur = data
        for part in selector.split("."):
            m = None
            name = part
            if "[" in part and part.endswith("]"):
                name, idx = part[:-1].split("[", 1)
            else:
                idx = None
            if name:
                if not isinstance(cur, dict) or name not in cur:
                    return ""
                cur = cur[name]
            if idx is not None:
                try:
                    cur = cur[int(idx)]
                except (ValueError, IndexError, TypeError, KeyError):
                    return ""
        return cur if isinstance(cur, str) else json.dumps(cur, ensure_ascii=False)
