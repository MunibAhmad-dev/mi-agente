"""Deterministic policy engine (spec §69).

Policies are declarative, versioned rules evaluated BEFORE any capital-moving
or external action. Result ALLOW | DENY | ESCALATE is persisted as a decision
record and audited. The LLM may propose; policies decide.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field

from aeos.core.audit import Audit
from aeos.core.db import Database
from aeos.core.decisions import Decisions
from aeos.core.events import EventBus

ALLOW, DENY, ESCALATE = "ALLOW", "DENY", "ESCALATE"


@dataclass(frozen=True)
class PolicyRule:
    """A single deterministic rule.

    condition receives the action context dict and returns bool (True = rule
    applies). effect decides the verdict. Order matters: first match wins.
    """

    name: str
    family: str                 # capital | agent | tool | market | system
    condition: callable         # (context: dict) -> bool
    effect: str                 # ALLOW | DENY | ESCALATE
    reason: str = ""


@dataclass
class PolicyResult:
    verdict: str
    rule: str | None
    reason: str
    decision_id: str | None = None
    context: dict = field(default_factory=dict)


class PolicyEngine:
    def __init__(self, db: Database, events: EventBus, audit: Audit,
                 decisions: Decisions | None = None):
        self.db = db
        self.events = events
        self.audit = audit
        self.decisions = decisions or Decisions(db)
        self._rules: list[PolicyRule] = []
        self._install_default_rules()

    # ---- rule management -------------------------------------------------
    def add_rule(self, rule: PolicyRule, ctx=None) -> None:
        if ctx is not None:  # policy changes themselves are permission-gated
            from aeos.governance.permissions import PermissionDenied
            try:
                ctx.require("MANAGE_POLICIES")
            except PermissionDenied:
                self.events.publish("PolicyBlocked", {"action": "add_rule", "rule": rule.name})
                raise
        self._rules.append(rule)
        self.audit.record("policy", "add_rule", rule.name, {"family": rule.family, "effect": rule.effect})

    def rules(self) -> list[str]:
        return [r.name for r in self._rules]

    def _install_default_rules(self) -> None:
        """Baseline deterministic policies from the spec (§52, §69, §145)."""
        self._rules.extend([
            PolicyRule("no_allocation_from_reserve", "capital",
                       lambda c: c.get("action") == "allocate" and c.get("bucket") == "RESERVE",
                       DENY, "RESERVE is untouchable (§17)"),
            PolicyRule("zero_amount_denied", "capital",
                       lambda c: c.get("action") in ("allocate", "withdraw", "settle_profit")
                       and c.get("amount_minor", 0) <= 0,
                       DENY, "amounts must be positive"),
            PolicyRule("dead_agent_capital_denied", "capital",
                       lambda c: c.get("agent_terminal") is True,
                       DENY, "dead agents cannot receive capital (§145)"),
            PolicyRule("huge_allocation_escalates", "capital",
                       lambda c: c.get("action") == "allocate"
                       and c.get("amount_minor", 0) > c.get("escalate_above_minor", 10_000_00),
                       ESCALATE, "allocations above escalation threshold need human approval (§71)"),
            PolicyRule("live_trade_requires_human", "market",
                       lambda c: c.get("action") == "live_trade"
                       and c.get("actor_kind") != "human",
                       DENY, "live trading requires a human principal (§71)"),
            PolicyRule("emergency_stop_freezes_capital", "system",
                       lambda c: c.get("emergency_stop") is True
                       and c.get("action") not in ("view", "emergency_stop_release"),
                       DENY, "EMERGENCY STOP active (§72): financial actions frozen"),
        ])

    # ---- evaluation ------------------------------------------------------
    def evaluate(self, action: str, context: dict) -> PolicyResult:
        ctx = {"action": action, **context}
        for rule in self._rules:
            try:
                applies = rule.condition(ctx)
            except Exception as exc:  # a broken rule must not ALLOW by accident
                self.audit.record("policy", "rule_error", rule.name, {"error": str(exc)})
                applies = False
            if applies:
                result = PolicyResult(verdict=rule.effect, rule=rule.name, reason=rule.reason,
                                      context=ctx)
                break
        else:
            result = PolicyResult(verdict=ALLOW, rule=None, reason="no rule matched", context=ctx)

        result.decision_id = self.decisions.record(
            selected=result.verdict, context=ctx, options=[ALLOW, DENY, ESCALATE],
            policy_result=result.verdict, authorization=result.rule or "default",
        )
        self.audit.record("policy", "evaluate", action,
                          {"verdict": result.verdict, "rule": result.rule})
        if result.verdict == DENY:
            self.events.publish("PolicyBlocked", {"action": action, "rule": result.rule,
                                                  "reason": result.reason})
        return result
