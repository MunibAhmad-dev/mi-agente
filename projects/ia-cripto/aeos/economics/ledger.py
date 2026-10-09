"""Economic ledger (spec §16): append-only critical financial history.

Each transaction records source, destination, amount (minor units), agent,
experiment, reason, authorization and policy result. INSERT-only by trigger;
balances are derived with SUM, never stored-mutated, so history is immutable
by construction (§145).
"""
from __future__ import annotations

from dataclasses import dataclass

from aeos.core.db import Database

# Transaction categories (§16)
CATEGORIES = (
    "capital_allocation", "capital_return", "capital_injection", "revenue", "expense",
    "fee", "refund", "loss", "profit_distribution", "reserve_move",
)


@dataclass(frozen=True)
class Entry:
    tx_id: int
    category: str
    source: str
    destination: str
    amount_minor: int
    agent_id: str | None
    experiment_id: str | None
    reason: str
    authorization: str | None
    external_reference: str | None


class Ledger:
    def __init__(self, db: Database):
        self.db = db
        db.execute(
            """CREATE TABLE IF NOT EXISTS ledger_entries (
                tx_id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts TEXT NOT NULL DEFAULT (datetime('now')),
                category TEXT NOT NULL,
                source TEXT NOT NULL,
                destination TEXT NOT NULL,
                amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
                agent_id TEXT,
                experiment_id TEXT,
                reason TEXT NOT NULL,
                authorization TEXT,
                policy_result TEXT,
                external_reference TEXT
            )"""
        )
        db.execute(
            """CREATE TRIGGER IF NOT EXISTS ledger_no_update BEFORE UPDATE ON ledger_entries
               BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;"""
        )
        db.execute(
            """CREATE TRIGGER IF NOT EXISTS ledger_no_delete BEFORE DELETE ON ledger_entries
               BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;"""
        )

    def post(
        self,
        category: str,
        source: str,
        destination: str,
        amount_minor: int,
        agent_id: str | None = None,
        experiment_id: str | None = None,
        reason: str = "",
        authorization: str | None = None,
        policy_result: str | None = None,
        external_reference: str | None = None,
    ) -> int:
        if category not in CATEGORIES:
            raise ValueError(f"unknown category {category!r}")
        if amount_minor <= 0:
            raise ValueError("ledger amounts must be positive; use category to express direction")
        # §80: revenue must trace to a real-world artifact. Profit settled
        # without an external reference is rejected (Phase 3 adds format
        # validation per provider).
        if category in ("revenue", "profit_distribution") and not external_reference:
            raise ValueError(
                f"category {category!r} requires external_reference (§80): "
                "real revenue must name the external artifact that produced it"
            )
        # authorization may be an AuthorizationContext (Phase 1) or a string;
        # store its principal id (or the string) - never a raw object.
        if authorization is not None and not isinstance(authorization, str):
            authorization = getattr(authorization, "principal_id", str(authorization))
        cur = self.db.execute(
            "INSERT INTO ledger_entries (category, source, destination, amount_minor,"
            " agent_id, experiment_id, reason, authorization, policy_result, external_reference)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (category, source, destination, amount_minor, agent_id, experiment_id,
             reason, authorization, policy_result, external_reference),
        )
        return int(cur.lastrowid)

    def balance_of(self, account: str) -> int:
        """Net position of an account: inflows (destination) minus outflows (source)."""
        row = self.db.one(
            "SELECT"
            " COALESCE(SUM(CASE WHEN destination=? THEN amount_minor ELSE 0 END),0) -"
            " COALESCE(SUM(CASE WHEN source=? THEN amount_minor ELSE 0 END),0) AS net"
            " FROM ledger_entries",
            (account, account),
        )
        return int(row["net"])

    def entries_for_agent(self, agent_id: str, limit: int = 100) -> list[dict]:
        return [
            dict(r) for r in self.db.query(
                "SELECT * FROM ledger_entries WHERE agent_id=? ORDER BY tx_id DESC LIMIT ?",
                (agent_id, limit),
            )
        ]
