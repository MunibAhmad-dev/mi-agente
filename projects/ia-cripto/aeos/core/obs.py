"""Observability (spec §112): structured JSON logs with correlation ids, plus
a lightweight metrics registry. OTel remains optional: when the SDK is absent
the same spans are emitted as structured log events, so LOCAL MODE keeps full
observability with zero dependencies.
"""
from __future__ import annotations

import json
import sys
import threading
import time
from contextlib import contextmanager
from dataclasses import dataclass, field


class Metrics:
    """Thread-safe counters/gauges/timers (Prometheus-style semantics)."""

    def __init__(self):
        self._lock = threading.Lock()
        self._counters: dict[str, float] = {}
        self._gauges: dict[str, float] = {}

    def inc(self, name: str, amount: float = 1.0) -> None:
        with self._lock:
            self._counters[name] = self._counters.get(name, 0.0) + amount

    def set_gauge(self, name: str, value: float) -> None:
        with self._lock:
            self._gauges[name] = value

    def snapshot(self) -> dict:
        with self._lock:
            return {"counters": dict(self._counters), "gauges": dict(self._gauges)}


METRICS = Metrics()


@dataclass
class LogContext:
    """Correlation fields attached to every log line within a scope."""
    agent_id: str | None = None
    cycle_id: str | None = None
    phase: str | None = None
    extra: dict = field(default_factory=dict)


class StructuredLogger:
    """JSON-lines logger: one object per line, always including ts, level,
    event, and any correlation fields. machine-parseable by default."""

    def __init__(self, stream=None, enabled: bool = True):
        self.stream = stream or sys.stderr
        self.enabled = enabled
        self.context = LogContext()

    def _emit(self, level: str, event: str, **fields) -> None:
        if not self.enabled:
            return
        record = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()),
            "level": level,
            "event": event,
        }
        ctx = self.context
        if ctx.agent_id:
            record["agent_id"] = ctx.agent_id
        if ctx.cycle_id:
            record["cycle_id"] = ctx.cycle_id
        if ctx.phase:
            record["phase"] = ctx.phase
        record.update(ctx.extra)
        record.update({k: v for k, v in fields.items() if v is not None})
        try:
            self.stream.write(json.dumps(record, default=str) + "\n")
            self.stream.flush()
        except Exception:
            pass  # logging must never crash the loop

    def info(self, event: str, **fields) -> None:
        self._emit("info", event, **fields)

    def warn(self, event: str, **fields) -> None:
        self._emit("warn", event, **fields)

    def error(self, event: str, **fields) -> None:
        self._emit("error", event, **fields)

    @contextmanager
    def scope(self, **ctx_fields):
        """Bind correlation fields for the duration of a block."""
        prev = self.context
        self.context = LogContext(**{**prev.__dict__, **{k: v for k, v in ctx_fields.items()
                                                         if k in LogContext.__dataclass_fields__}},
                                  )
        self.context.extra = {**prev.extra, **{k: v for k, v in ctx_fields.items()
                                               if k not in LogContext.__dataclass_fields__}}
        try:
            yield self
        finally:
            self.context = prev


LOGGER = StructuredLogger(enabled=False)  # disabled by default; tests opt in


@contextmanager
def span(name: str, **attrs):
    """Zero-dependency span: timing + metrics + structured log. When the OTel
    SDK is installed, an adapter can forward this; locally it is the span."""
    start = time.perf_counter()
    METRICS.inc(f"span.{name}.started")
    err = None
    try:
        yield
    except Exception as exc:
        err = exc
        METRICS.inc(f"span.{name}.errors")
        LOGGER.error("span.failed", span=name, error=str(exc), **attrs)
        raise
    finally:
        dur = time.perf_counter() - start
        METRICS.set_gauge(f"span.{name}.last_seconds", round(dur, 6))
        if err is None:
            METRICS.inc(f"span.{name}.ok")
            LOGGER.info("span.ok", span=name, seconds=round(dur, 6), **attrs)
