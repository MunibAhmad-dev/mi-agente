"""Treasury (spec §17, §52): seven buckets with hard invariants.

- allocated can never exceed bucket balance
- RESERVE can never fall below reserve_floor fraction of total treasury
- every movement is mirrored to the Ledger (append-only) with authorization
"""
from __future__ import annotations

from aeos.core.audit import Audit
from aeos.core.db import Database
from aeos.core.events import EventBus
from aeos.economics.ledger import Ledger

BUCKETS = ("RESERVE", "OPERATING", "EXPERIMENT", "BUSINESS", "INVESTMENT", "RESEARCH", "EMERGENCY")

REVENUE_CATEGORIES = ("revenue", "profit_distribution")

TERMINAL_STATES = ("FAILED", "KILLED", "BANKRUPT", "EXPIRED", "BLOCKED", "REPLACED")


def _ctx_of(authorization):
    """Accept either an AuthorizationContext or a legacy string."""
    if authorization is None or isinstance(authorization, str):
        return None
    return authorization


class TreasuryError(Exception):
    pass


class Treasury:
    def __init__(self, db: Database, ledger: Ledger, events: EventBus, audit: Audit,
                 reserve_floor: float = 0.30, max_experiment_budget: float = 0.10,
                 max_investment_allocation: float = 0.35, max_business_allocation: float = 0.40):
        self.db = db
        self.ledger = ledger
        self.events = events
        self.audit = audit
        self.reserve_floor = reserve_floor
        self.max_experiment_budget = max_experiment_budget
        self.max_investment_allocation = max_investment_allocation
        self.max_business_allocation = max_business_allocation

    # ---- state -------------------------------------------------------
    def buckets(self) -> dict[str, dict]:
        rows = self.db.query("SELECT bucket, balance_minor, allocated_minor FROM treasury ORDER BY bucket")
        return {r["bucket"]: {"balance": r["balance_minor"], "allocated": r["allocated_minor"]} for r in rows}

    def total(self) -> int:
        return sum(b["balance"] for b in self.buckets().values())

    def available(self, bucket: str) -> int:
        b = self.buckets().get(bucket)
        if b is None:
            raise TreasuryError(f"unknown bucket {bucket!r}")
        return b["balance"] - b["allocated"]

    def allocated(self, bucket: str) -> int:
        return self.buckets().get(bucket, {"allocated": 0})["allocated"]

    # ---- deposits / withdrawals (system boundary) ---------------------
    def deposit(self, bucket: str, amount_minor: int, authorization: str = "system") -> int:
        self._require_bucket(bucket)
        if amount_minor <= 0:
            raise TreasuryError("deposit must be positive")
        ctx = _ctx_of(authorization)
        if ctx is not None:
            ctx.require("WITHDRAW_CAPITAL")  # deposits change treasury too
        with self.db.transaction() as conn:
            conn.execute(
                "INSERT INTO treasury (bucket, balance_minor, allocated_minor) VALUES (?, ?, 0)"
                " ON CONFLICT(bucket) DO UPDATE SET balance_minor = balance_minor + excluded.balance_minor,"
                " updated_at = datetime('now')",
                (bucket, amount_minor),
            )
            self._check_reserve_floor(conn, enforce=False)
            tx = self.ledger.post(
                "capital_injection" if bucket != "RESERVE" else "reserve_move",
                source="EXTERNAL", destination=f"treasury:{bucket}", amount_minor=amount_minor,
                reason=f"deposit to {bucket}", authorization=authorization,
            )
        self.audit.record("treasury", "deposit", bucket, {"amount_minor": amount_minor, "tx": tx})
        return tx

    def withdraw(self, bucket: str, amount_minor: int, authorization) -> int:
        """External withdrawal (e.g., real-world spend); requires authorization."""
        ctx = _ctx_of(authorization)
        if ctx is not None:
            ctx.require("WITHDRAW_CAPITAL")
        self._require_bucket(bucket)
        if amount_minor <= 0:
            raise TreasuryError("withdraw must be positive")
        with self.db.transaction() as conn:
            row = conn.execute(
                "SELECT balance_minor, allocated_minor FROM treasury WHERE bucket=?", (bucket,)
            ).fetchone()
            if not row or row["balance_minor"] - row["allocated_minor"] < amount_minor:
                raise TreasuryError(f"insufficient available in {bucket}")
            conn.execute(
                "UPDATE treasury SET balance_minor = balance_minor - ?, updated_at = datetime('now') WHERE bucket=?",
                (amount_minor, bucket),
            )
            self._check_reserve_floor(conn)
            tx = self.ledger.post(
                "expense", source=f"treasury:{bucket}", destination="EXTERNAL",
                amount_minor=amount_minor, reason="external withdrawal", authorization=authorization,
            )
        self.audit.record("treasury", "withdraw", bucket, {"amount_minor": amount_minor, "tx": tx})
        return tx

    # ---- allocation to agents ----------------------------------------
    def allocate(self, bucket: str, agent_id: str, amount_minor: int,
                 reason: str, authorization, policy_result: str = "APPROVE") -> int:
        """Allocate capital from a bucket to an agent (allocated +, cash +).

        Invariants enforced: allocated <= balance; reserve floor respected.
        `authorization` is either an AuthorizationContext (Phase 1) or a legacy
        string for internal calls; real permission enforcement happens when a
        context is presented.
        """
        ctx = _ctx_of(authorization)
        if ctx is not None:
            ctx.require("ALLOCATE_CAPITAL")
        self._require_bucket(bucket)
        if bucket == "RESERVE":
            raise TreasuryError("cannot allocate directly from RESERVE")
        if amount_minor <= 0:
            raise TreasuryError("allocation must be positive")
        # §145: dead_agent_spend == 0 - terminal agents can never receive capital
        agent_row = self.db.one("SELECT state FROM agents WHERE id=?", (agent_id,))
        if agent_row and agent_row["state"] in TERMINAL_STATES:
            raise TreasuryError(
                f"agent {agent_id} is terminal ({agent_row['state']}); dead agents cannot spend (§145)"
            )
        caps_bps = {
            "EXPERIMENT": int(round(self.max_experiment_budget * 10_000)),
            "INVESTMENT": int(round(self.max_investment_allocation * 10_000)),
            "BUSINESS": int(round(self.max_business_allocation * 10_000)),
        }
        if bucket in caps_bps:
            cap = self.total() * caps_bps[bucket] // 10_000  # integer bps math (probe F5)
            if amount_minor > cap:
                raise TreasuryError(
                    f"allocation {amount_minor} exceeds {bucket} cap {cap} (policy)"
                )
        with self.db.transaction() as conn:
            row = conn.execute(
                "SELECT balance_minor, allocated_minor FROM treasury WHERE bucket=?", (bucket,)
            ).fetchone()
            if not row or row["balance_minor"] - row["allocated_minor"] < amount_minor:
                raise TreasuryError(f"insufficient available in {bucket}")
            conn.execute(
                "UPDATE treasury SET allocated_minor = allocated_minor + ?, updated_at = datetime('now')"
                " WHERE bucket=?",
                (amount_minor, bucket),
            )
            conn.execute(
                "INSERT INTO agent_economics (agent_id, cash_minor, allocated_minor) VALUES (?, ?, ?)"
                " ON CONFLICT(agent_id) DO UPDATE SET cash_minor = cash_minor + excluded.cash_minor,"
                " allocated_minor = allocated_minor + excluded.allocated_minor",
                (agent_id, amount_minor, amount_minor),
            )
            # allocation only moves balance->allocated within the bucket; it does
            # not erode total capital, so the floor check does not apply here.
            tx = self.ledger.post(
                "capital_allocation", source=f"treasury:{bucket}", destination=f"agent:{agent_id}",
                amount_minor=amount_minor, agent_id=agent_id, reason=reason,
                authorization=authorization, policy_result=policy_result,
            )
        self.events.publish("CapitalAllocated", {"agent_id": agent_id, "bucket": bucket,
                                                 "amount_minor": amount_minor})
        self.audit.record("treasury", "allocate", agent_id,
                          {"bucket": bucket, "amount_minor": amount_minor, "reason": reason})
        return tx

    def return_capital(self, bucket: str, agent_id: str, amount_minor: int,
                       reason: str = "return unused capital") -> int:
        """Return unused allocated capital from an agent to its bucket."""
        self._require_bucket(bucket)
        if amount_minor <= 0:
            raise TreasuryError("return must be positive")
        with self.db.transaction() as conn:
            row = conn.execute(
                "SELECT cash_minor, allocated_minor FROM agent_economics WHERE agent_id=?", (agent_id,)
            ).fetchone()
            if not row or row["cash_minor"] < amount_minor:
                raise TreasuryError("agent cannot return more cash than it holds")
            conn.execute(
                "UPDATE agent_economics SET cash_minor = cash_minor - ?, allocated_minor = allocated_minor - ?"
                " WHERE agent_id=?",
                (amount_minor, amount_minor, agent_id),
            )
            conn.execute(
                "UPDATE treasury SET allocated_minor = allocated_minor - ?, updated_at = datetime('now')"
                " WHERE bucket=?",
                (amount_minor, bucket),
            )
            tx = self.ledger.post(
                "capital_return", source=f"agent:{agent_id}", destination=f"treasury:{bucket}",
                amount_minor=amount_minor, agent_id=agent_id, reason=reason,
            )
        self.events.publish("CapitalReturned", {"agent_id": agent_id, "bucket": bucket,
                                                "amount_minor": amount_minor})
        return tx

    # ---- profit / loss settlement ------------------------------------
    def settle_profit(self, bucket: str, agent_id: str, amount_minor: int, reason: str,
                      external_reference: str | None = None, authorization=None) -> int:
        """Settle realized external revenue into the treasury.

        Money model: agent cash is a CLAIM backed by the bucket earmark
        (invariant: Σ agent_cash == Σ bucket.allocated). External revenue is
        NEW money that lands directly in the bucket - the agent's cash is not
        debited because the revenue never entered agent cash. Real-money
        conservation: total() = injected + Σrevenue − Σloss − Σwithdraw.

        §80: revenue requires external_reference naming the real-world artifact
        that produced it (payment id, order id, campaign id). Synthetic profit
        cannot pass (§2). Reconciliation (Phase 3) verifies the reference.
        """
        ctx = _ctx_of(authorization)
        if ctx is not None:
            ctx.require("SETTLE_PROFIT")
        self._require_bucket(bucket)
        if amount_minor <= 0:
            raise TreasuryError("profit must be positive")
        if not external_reference:
            raise TreasuryError(
                "settle_profit requires external_reference (§80): real revenue must "
                "name the external artifact that produced it"
            )
        with self.db.transaction() as conn:
            if not self.db.one("SELECT 1 FROM agents WHERE id=?", (agent_id,)):
                raise TreasuryError(f"unknown agent {agent_id!r}")
            conn.execute(
                "UPDATE treasury SET balance_minor = balance_minor + ?, updated_at = datetime('now')"
                " WHERE bucket=?",
                (amount_minor, bucket),
            )
            tx = self.ledger.post(
                "revenue", source=f"agent:{agent_id}", destination=f"treasury:{bucket}",
                amount_minor=amount_minor, agent_id=agent_id, reason=reason,
                external_reference=external_reference,
            )
        self.events.publish("RevenueRecorded", {"agent_id": agent_id, "amount_minor": amount_minor,
                                                "external_reference": external_reference})
        self.audit.record("treasury", "settle_profit", agent_id,
                          {"amount_minor": amount_minor, "external_reference": external_reference})
        return tx

    def settle_loss(self, bucket: str, agent_id: str, amount_minor: int, reason: str) -> int:
        """Agent's realized loss: the cash left the system (spent on something
        that produced nothing). Agent cash is debited AND the bucket balance is
        debited - keeping the balance would create phantom money (found by the
        global conservation test: unallocated + agent cash must stay constant
        across losses)."""
        self._require_bucket(bucket)
        if amount_minor <= 0:
            raise TreasuryError("loss must be positive")
        with self.db.transaction() as conn:
            row = conn.execute(
                "SELECT cash_minor, allocated_minor FROM agent_economics WHERE agent_id=?", (agent_id,)
            ).fetchone()
            if not row or row["cash_minor"] < amount_minor:
                raise TreasuryError("loss cannot exceed agent cash")
            conn.execute(
                "UPDATE agent_economics SET cash_minor = cash_minor - ?, allocated_minor = allocated_minor - ?"
                " WHERE agent_id=?",
                (amount_minor, amount_minor, agent_id),
            )
            conn.execute(
                "UPDATE treasury SET balance_minor = balance_minor - ?, allocated_minor = allocated_minor - ?,"
                " updated_at = datetime('now') WHERE bucket=?",
                (amount_minor, amount_minor, bucket),
            )
            tx = self.ledger.post(
                "loss", source=f"agent:{agent_id}", destination="EXTERNAL",
                amount_minor=amount_minor, agent_id=agent_id, reason=reason,
            )
        self.events.publish("ExpenseRecorded", {"agent_id": agent_id, "amount_minor": amount_minor})
        return tx

    # ---- invariants ----------------------------------------------------
    def validate(self) -> None:
        """Assert the global money identities (called by tests and doctor).

        1. Σ agent_cash == Σ bucket.allocated  (claims match earmarks)
        2. allocated <= balance per bucket     (no promise beyond holdings)
        """
        claims = self.db.one("SELECT COALESCE(SUM(cash_minor),0) AS s FROM agent_economics")["s"]
        earmarks = self.db.one("SELECT COALESCE(SUM(allocated_minor),0) AS s FROM treasury")["s"]
        if int(claims) != int(earmarks):
            raise TreasuryError(
                f"money identity broken: agent cash {claims} != earmarks {earmarks}"
            )
        for bucket, b in self.buckets().items():
            if b["allocated"] > b["balance"]:
                raise TreasuryError(
                    f"bucket {bucket}: allocated {b['allocated']} exceeds balance {b['balance']}"
                )

    def _check_reserve_floor(self, conn, enforce: bool = True) -> None:
        """Reserve floor (§17) applies to capital erosion: it is enforced when the
        operation DECREASES total treasury (withdrawals/spend). New external
        deposits grow non-reserve buckets without touching RESERVE, which is
        new money, not a floor breach - enforcing there would reject fresh
        operating capital."""
        if not enforce:
            return
        row = conn.execute(
            "SELECT SUM(balance_minor) AS total, "
            "(SELECT balance_minor FROM treasury WHERE bucket='RESERVE') AS reserve "
            "FROM treasury"
        ).fetchone()
        total = int(row["total"] or 0)
        reserve = int(row["reserve"] or 0)
        # integer basis-point math avoids float boundary errors (0.30*total vs exact reserve)
        floor_bps = int(round(self.reserve_floor * 10_000))
        if total > 0 and reserve * 10_000 < floor_bps * total:
            raise TreasuryError(
                f"reserve floor violated: reserve {reserve} < floor {self.reserve_floor} of total {total}"
            )

    def _require_bucket(self, bucket: str) -> None:
        if bucket not in BUCKETS:
            raise TreasuryError(f"unknown bucket {bucket!r}")
