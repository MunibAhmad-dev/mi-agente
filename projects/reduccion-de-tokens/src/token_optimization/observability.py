"""Observability: thread-safe metrics registry (spec §40, §65).

Counters and simple timing aggregates, local and dependency-free. The API and
CLI expose snapshots; an OpenTelemetry exporter can consume the same snapshot
later without touching call sites.
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field


@dataclass
class _Agg:
    count: int = 0
    total: float = 0.0
    max: float = 0.0

    def add(self, v: float) -> None:
        self.count += 1
        self.total += v
        self.max = max(self.max, v)


class MetricsRegistry:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._counters: dict[str, float] = {}
        self._timings: dict[str, _Agg] = {}
        self._started = time.time()

    # -- counters -----------------------------------------------------------
    def inc(self, name: str, value: float = 1.0) -> None:
        with self._lock:
            self._counters[name] = self._counters.get(name, 0.0) + value

    def counter(self, name: str) -> float:
        with self._lock:
            return self._counters.get(name, 0.0)

    # -- timings ------------------------------------------------------------
    def observe_ms(self, name: str, ms: float) -> None:
        with self._lock:
            self._timings.setdefault(name, _Agg()).add(ms)

    @staticmethod
    def timed(name: str, registry: "MetricsRegistry | None" = None):
        """Decorator: records wall time in ms into `name`."""
        reg = registry

        def deco(fn):
            def wrapper(*args, **kwargs):
                r = reg or GLOBAL_METRICS
                t0 = time.perf_counter()
                try:
                    return fn(*args, **kwargs)
                finally:
                    r.observe_ms(name, (time.perf_counter() - t0) * 1000.0)
            return wrapper
        return deco

    # -- snapshot -----------------------------------------------------------
    def snapshot(self) -> dict:
        with self._lock:
            counters = dict(self._counters)
            timings = {
                k: {"count": a.count, "total_ms": round(a.total, 3),
                    "avg_ms": round(a.total / a.count, 3) if a.count else 0.0,
                    "max_ms": round(a.max, 3)}
                for k, a in self._timings.items()
            }
        return {
            "uptime_s": round(time.time() - self._started, 1),
            "counters": counters,
            "timings": timings,
        }

    def reset(self) -> None:
        with self._lock:
            self._counters.clear()
            self._timings.clear()
            self._started = time.time()


GLOBAL_METRICS = MetricsRegistry()

# canonical metric names (single source of truth for call sites)
M_COMPRESSIONS = "compressions_total"
M_ROLLBACKS = "compression_rollbacks_total"
M_FIDELITY_FAILURES = "fidelity_failures_total"
M_EXTERNALIZED = "items_externalized_total"
M_DEDUP_REMOVED = "dedup_removed_total"
M_RECOVERIES = "recoveries_total"
M_RECOVERY_TOKENS = "recovery_tokens_total"
M_STORE_PUTS = "store_puts_total"
M_SECRETS_REDACTED = "secrets_redacted_total"
M_CONTRADICTIONS = "contradictions_detected_total"
T_CASCADE_MS = "cascade_ms"
T_RECOVERY_MS = "recovery_ms"
