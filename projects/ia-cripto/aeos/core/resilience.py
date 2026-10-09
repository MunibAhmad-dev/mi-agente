"""Resilience (spec §121-122): error classification, retry policy, circuit
breaker.

- Errors are classified TRANSIENT / PERMANENT / EXTERNAL / INTERNAL / POLICY /
  SECURITY / UNKNOWN.
- Only TRANSIENT and EXTERNAL errors are retryable; UNKNOWN is NEVER retried
  automatically - the caller must resolve state with the provider first (§68).
- The circuit breaker is per provider and shared through the DB so multiple
  workers see the same state.
"""
from __future__ import annotations

import enum
import random
import time
from collections.abc import Callable
from typing import Any

from aeos.core.audit import Audit
from aeos.core.db import Database
from aeos.core.events import EventBus


class ErrorClass(str, enum.Enum):
    TRANSIENT = "TRANSIENT"        # timeout, temporary unavailability -> retry
    PERMANENT = "PERMANENT"        # validation error -> never retry
    EXTERNAL = "EXTERNAL"          # provider down -> retry with backoff
    INTERNAL = "INTERNAL"          # our bug -> never retry
    POLICY = "POLICY"              # blocked by policy -> never retry
    SECURITY = "SECURITY"          # authz failure -> never retry
    UNKNOWN = "UNKNOWN"            # outcome uncertain -> query provider, don't retry


RETRYABLE = {ErrorClass.TRANSIENT, ErrorClass.EXTERNAL}


def classify(exc: BaseException) -> ErrorClass:
    """Classify an exception by type and message heuristics (§121).

    Adapters may attach a precise error_class (e.g. the ccxt adapter's
    taxonomy); when present it takes precedence over message heuristics.
    """
    pre = getattr(exc, "error_class", None)
    if isinstance(pre, ErrorClass):
        return pre
    name = type(exc).__name__.lower()
    msg = str(exc).lower()
    if isinstance(exc, (KeyboardInterrupt, SystemExit)):
        raise exc
    if "timeout" in name or "timed out" in msg or "timeout" in msg:
        return ErrorClass.TRANSIENT
    if "connection" in name and ("reset" in msg or "refused" in msg or "error" in name):
        return ErrorClass.TRANSIENT
    if "permission" in name or "unauthorized" in msg or "forbidden" in msg or "auth" in name:
        return ErrorClass.SECURITY
    if "policy" in name or "blocked" in msg:
        return ErrorClass.POLICY
    if "value" in name or "invalid" in msg or "validation" in msg or "not found" in msg:
        return ErrorClass.PERMANENT
    if "rate limit" in msg or "429" in msg or "503" in msg or "unavailable" in msg:
        return ErrorClass.EXTERNAL
    if "unknown" in msg or "ambiguous" in msg or "outcome" in msg:
        return ErrorClass.UNKNOWN
    return ErrorClass.INTERNAL


class CircuitOpen(Exception):
    """Raised when a call is attempted while the circuit is OPEN."""


class CircuitBreaker:
    """Per-provider breaker persisted in provider_health (shared across workers)."""

    def __init__(self, db: Database, events: EventBus, audit: Audit,
                 failure_threshold: int = 5, reset_seconds: int = 30):
        self.db = db
        self.events = events
        self.audit = audit
        self.threshold = failure_threshold
        self.reset_seconds = reset_seconds

    def _row(self, provider: str) -> dict:
        self.db.execute("INSERT OR IGNORE INTO provider_health (provider) VALUES (?)", (provider,))
        return dict(self.db.one("SELECT * FROM provider_health WHERE provider=?", (provider,)))

    def before_call(self, provider: str) -> None:
        st = self._row(provider)
        if st["state"] == "OPEN":
            opened = st["opened_at"]
            if opened and self._expired(opened):
                self.db.execute(
                    "UPDATE provider_health SET state='HALF_OPEN', half_open_at=datetime('now')"
                    " WHERE provider=?", (provider,))
                return
            raise CircuitOpen(f"circuit OPEN for {provider} (probe before call)")

    def on_success(self, provider: str) -> None:
        self.db.execute(
            "UPDATE provider_health SET state='CLOSED', failures=0, last_error=NULL,"
            " opened_at=NULL, half_open_at=NULL WHERE provider=?",
            (provider,),
        )

    def on_failure(self, provider: str, error: str) -> None:
        st = self._row(provider)
        failures = st["failures"] + 1
        state = st["state"]
        if failures >= self.threshold or st["state"] == "HALF_OPEN":
            state = "OPEN"
            self.events.publish("RiskTriggered", {
                "kind": "circuit_open", "provider": provider, "failures": failures,
                "error": error[:300]})
            self.audit.record("resilience", "circuit_open", provider, {"failures": failures})
        self.db.execute(
            "UPDATE provider_health SET failures=?, state=?, last_error=?,"
            " opened_at=CASE WHEN ?='OPEN' AND opened_at IS NULL THEN datetime('now')"
            " ELSE opened_at END WHERE provider=?",
            (failures, state, error[:500], state, provider),
        )

    def _expired(self, opened_at: str) -> bool:
        # opened_at is sqlite 'YYYY-MM-DD HH:MM:SS' (UTC)
        import datetime as dt
        try:
            t = dt.datetime.strptime(opened_at, "%Y-%m-%d %H:%M:%S").replace(
                tzinfo=dt.timezone.utc)
        except ValueError:
            return True
        age = (dt.datetime.now(dt.timezone.utc) - t).total_seconds()
        return age >= self.reset_seconds

    def status(self, provider: str) -> dict:
        st = self._row(provider)
        return {"provider": provider, "state": st["state"], "failures": st["failures"]}


class RetryPolicy:
    def __init__(self, max_attempts: int = 3, base_delay: float = 0.2,
                 max_delay: float = 5.0, jitter: float = 0.1):
        self.max_attempts = max_attempts
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.jitter = jitter

    def delay_for(self, attempt: int) -> float:
        d = min(self.max_delay, self.base_delay * (2 ** (attempt - 1)))
        return d + random.uniform(0, self.jitter)


def call_with_resilience(
    provider: str,
    fn: Callable[[], Any],
    breaker: CircuitBreaker,
    policy: RetryPolicy | None = None,
    on_unknown: Callable[[BaseException], Any] | None = None,
) -> Any:
    """Run fn() with classification, retries and circuit breaking (§122).

    UNKNOWN outcomes are never retried: on_unknown is invoked (default: re-raise
    wrapped) so the caller resolves state with the provider first (§68).
    """
    policy = policy or RetryPolicy()
    breaker.before_call(provider)
    last: BaseException | None = None
    for attempt in range(1, policy.max_attempts + 1):
        try:
            result = fn()
            breaker.on_success(provider)
            return result
        except BaseException as exc:  # noqa: BLE001 - classified below
            klass = classify(exc)
            last = exc
            if klass == ErrorClass.UNKNOWN:
                breaker.on_failure(provider, f"UNKNOWN: {exc}")
                if on_unknown:
                    return on_unknown(exc)
                raise RuntimeError(
                    f"UNKNOWN outcome from {provider}; resolve with provider before retry"
                ) from exc
            if klass in RETRYABLE and attempt < policy.max_attempts:
                breaker.on_failure(provider, str(exc))
                time.sleep(policy.delay_for(attempt))
                continue
            if klass not in RETRYABLE:
                breaker.on_failure(provider, str(exc))
                raise
    raise last  # pragma: no cover - exhausted retryable attempts
