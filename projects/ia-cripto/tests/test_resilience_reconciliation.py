"""Phase 3 tests: resilience (§121-122) and reconciliation (§67).

The headline guarantee: revenue built on an unreconciled or disputed external
reference cannot pass as confirmed, and UNKNOWN provider outcomes are never
blindly retried (§68).
"""
from __future__ import annotations

import pytest

from aeos.core.audit import Audit
from aeos.core.db import Database
from aeos.core.events import EventBus
from aeos.core.migrations import migrate
from aeos.core.resilience import (
    CircuitBreaker, CircuitOpen, ErrorClass, RetryPolicy, call_with_resilience, classify,
)
from aeos.reconciliation import ReconciliationEngine, ReconciliationError


@pytest.fixture()
def sys3():
    db = Database(":memory:")
    migrate(db)
    events = EventBus(db)
    audit = Audit(db)
    return {"db": db, "events": events, "audit": audit,
            "recon": ReconciliationEngine(db, events, audit),
            "breaker": CircuitBreaker(db, events, audit, failure_threshold=3)}


# ---- classification -------------------------------------------------------

def test_classification_rules():
    assert classify(TimeoutError("timed out")) == ErrorClass.TRANSIENT
    assert classify(ValueError("invalid symbol")) == ErrorClass.PERMANENT
    assert classify(PermissionError("unauthorized")) == ErrorClass.SECURITY
    assert classify(RuntimeError("rate limit exceeded")) == ErrorClass.EXTERNAL
    assert classify(RuntimeError("ambiguous outcome: order may or may not exist")) \
        == ErrorClass.UNKNOWN


# ---- circuit breaker --------------------------------------------------------

def test_circuit_breaker_opens_after_threshold_and_recovers(sys3):
    br = sys3["breaker"]
    for i in range(3):
        br.on_failure("binance", f"fail {i}")
    with pytest.raises(CircuitOpen):
        br.before_call("binance")
    assert br.status("binance")["state"] == "OPEN"
    # success in HALF_OPEN resets
    br.db.execute(
        "UPDATE provider_health SET state='HALF_OPEN' WHERE provider='binance'")
    br.on_success("binance")
    assert br.status("binance")["state"] == "CLOSED"


def test_call_with_resilience_retries_transient(sys3):
    br = sys3["breaker"]
    calls = {"n": 0}

    def flaky():
        calls["n"] += 1
        if calls["n"] < 3:
            raise TimeoutError("timeout")
        return "ok"

    pol = RetryPolicy(max_attempts=5, base_delay=0.001)
    assert call_with_resilience("stripe", flaky, br, pol) == "ok"
    assert calls["n"] == 3


def test_call_with_resilience_never_retries_permanent(sys3):
    br = sys3["breaker"]
    calls = {"n": 0}

    def bad_input():
        calls["n"] += 1
        raise ValueError("invalid amount")

    with pytest.raises(ValueError):
        call_with_resilience("stripe", bad_input, br, RetryPolicy(max_attempts=5))
    assert calls["n"] == 1


def test_unknown_outcome_never_retried_requires_provider_query(sys3):
    """§68: UNKNOWN means 'maybe executed' - retrying could double-spend."""
    br = sys3["breaker"]
    calls = {"n": 0}

    def ambiguous():
        calls["n"] += 1
        raise RuntimeError("ambiguous outcome from exchange")

    queried = {"asked": False}

    def query_provider(exc):
        queried["asked"] = True
        return {"resolved": True, "order_status": "filled"}

    result = call_with_resilience("binance", ambiguous, br,
                                  RetryPolicy(max_attempts=4), on_unknown=query_provider)
    assert result == {"resolved": True, "order_status": "filled"}
    assert calls["n"] == 1          # exactly one attempt
    assert queried["asked"] is True


# ---- reconciliation ---------------------------------------------------------

def test_reconciliation_confirms_matching_amounts(sys3):
    recon = sys3["recon"]
    recon.record_external("stripe", "pi_123", "payment", amount_minor=5000)
    res = recon.compare("stripe", "pi_123", internal_amount_minor=5000,
                        external_amount_minor=5000)
    assert res["status"] == "CONFIRMED" and res["dispute_id"] is None
    assert recon.is_confirmed("stripe", "pi_123")


def test_mismatch_opens_dispute_and_blocks_linking(sys3):
    recon = sys3["recon"]
    recon.record_external("stripe", "pi_456", "payment", amount_minor=9000)
    res = recon.compare("stripe", "pi_456", internal_amount_minor=9000,
                        external_amount_minor=7000)
    assert res["status"] == "MISMATCH" and res["dispute_id"]
    # revenue cannot be linked to a disputed reference (§67)
    with pytest.raises(ReconciliationError):
        recon.link_to_ledger("stripe", "pi_456", ledger_tx_id=1)
    # resolve with provider truth
    recon.resolve_dispute(res["dispute_id"], "provider charge was partial",
                          corrected_amount_minor=7000)
    recon.link_to_ledger("stripe", "pi_456", ledger_tx_id=2)
    assert recon.is_confirmed("stripe", "pi_456")
    assert recon.open_disputes() == []


def test_linking_unknown_ref_rejected(sys3):
    with pytest.raises(ReconciliationError):
        sys3["recon"].link_to_ledger("stripe", "pi_nope", ledger_tx_id=1)


def test_revenue_requires_external_reference_end_to_end(sys3):
    """The full §80 chain: ledger rejects revenue without external_reference."""
    from aeos.economics.ledger import Ledger
    ledger = Ledger(sys3["db"])
    with pytest.raises(ValueError):
        ledger.post("revenue", "agent:a1", "treasury:OPERATING", 5000, reason="sale")
    tx = ledger.post("revenue", "agent:a1", "treasury:OPERATING", 5000,
                     reason="sale", external_reference="stripe:pi_123")
    sys3["recon"].record_external("stripe", "pi_123", "payment", amount_minor=5000)
    sys3["recon"].link_to_ledger("stripe", "pi_123", ledger_tx_id=tx)
    assert sys3["recon"].is_confirmed("stripe", "pi_123")
