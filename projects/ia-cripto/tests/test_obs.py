"""Observability tests (§112): structured logs, correlation, metrics, spans.
"""
from __future__ import annotations

import io
import json

import pytest

from aeos.core.obs import METRICS, LogContext, StructuredLogger, span


def test_structured_logs_emit_json_lines_with_correlation():
    buf = io.StringIO()
    log = StructuredLogger(stream=buf, enabled=True)
    with log.scope(agent_id="agt_1", cycle_id="cyc_9", phase="account"):
        log.info("settlement", profit_minor=500)
    line = json.loads(buf.getvalue().strip())
    assert line["event"] == "settlement"
    assert line["agent_id"] == "agt_1" and line["cycle_id"] == "cyc_9"
    assert line["phase"] == "account" and line["profit_minor"] == 500
    assert line["level"] == "info" and "ts" in line


def test_scope_is_restored_after_block():
    buf = io.StringIO()
    log = StructuredLogger(stream=buf, enabled=True)
    with log.scope(agent_id="agt_x"):
        log.info("inside")
    log.info("outside")
    lines = [json.loads(l) for l in buf.getvalue().strip().splitlines()]
    assert "agent_id" in lines[0] and "agent_id" not in lines[1]


def test_metrics_counters_and_gauges():
    METRICS.inc("orders.submitted", 3)
    METRICS.inc("orders.submitted")
    METRICS.set_gauge("treasury.total", 1_000_000)
    snap = METRICS.snapshot()
    assert snap["counters"]["orders.submitted"] == 4
    assert snap["gauges"]["treasury.total"] == 1_000_000


def test_span_records_timing_and_errors():
    buf = io.StringIO()
    log = StructuredLogger(stream=buf, enabled=True)
    import aeos.core.obs as obs
    old = obs.LOGGER
    obs.LOGGER = log
    try:
        with span("allocate", agent_id="agt_1"):
            pass
        with pytest.raises(ValueError):
            with span("settle", agent_id="agt_2"):
                raise ValueError("boom")
    finally:
        obs.LOGGER = old
    lines = [json.loads(l) for l in buf.getvalue().strip().splitlines()]
    assert lines[0]["event"] == "span.ok" and lines[0]["span"] == "allocate"
    assert lines[1]["event"] == "span.failed" and lines[1]["agent_id"] == "agt_2"
    snap = METRICS.snapshot()
    assert snap["counters"]["span.settle.errors"] >= 1
    assert snap["gauges"]["span.allocate.last_seconds"] >= 0
