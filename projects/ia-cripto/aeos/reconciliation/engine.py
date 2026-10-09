"""Universal reconciliation engine (spec §67, §167j).

Discovers "my ledger says X, the provider says Y" for any provider: payments,
exchange orders, campaigns, emails, hosting. A detected mismatch opens a
dispute and the affected external reference is marked MISMATCH - revenue built
on an unreconciled reference cannot be treated as confirmed.
"""
from __future__ import annotations

import json
import uuid

from aeos.core.audit import Audit
from aeos.core.db import Database
from aeos.core.events import EventBus


class ReconciliationError(Exception):
    pass


class ReconciliationEngine:
    def __init__(self, db: Database, events: EventBus, audit: Audit):
        self.db = db
        self.events = events
        self.audit = audit

    # ---- external reference registry ------------------------------------
    def record_external(self, provider: str, external_id: str, kind: str,
                        amount_minor: int | None = None, currency: str = "usd",
                        raw: dict | None = None) -> None:
        """Register (or update) an external artifact observed at the provider.
        Idempotent per (provider, external_id)."""
        self.db.execute(
            """INSERT INTO external_refs (provider, external_id, kind, amount_minor,
                   currency, raw_json)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(provider, external_id) DO UPDATE SET
                   amount_minor=excluded.amount_minor,
                   raw_json=excluded.raw_json""",
            (provider, external_id, kind, amount_minor, currency,
             json.dumps(raw or {}, default=str)),
        )

    def link_to_ledger(self, provider: str, external_id: str, ledger_tx_id: int) -> None:
        """Mark an external artifact as CONFIRMED and link its ledger entry."""
        row = self.db.one(
            "SELECT status FROM external_refs WHERE provider=? AND external_id=?",
            (provider, external_id),
        )
        if not row:
            raise ReconciliationError(
                f"unknown external ref {provider}:{external_id}; record it first"
            )
        if row["status"] == "MISMATCH":
            raise ReconciliationError(
                f"{provider}:{external_id} has an OPEN dispute; resolve it first (§67)"
            )
        self.db.execute(
            "UPDATE external_refs SET status='CONFIRMED', ledger_tx_id=?,"
            " confirmed_at=datetime('now') WHERE provider=? AND external_id=?",
            (ledger_tx_id, provider, external_id),
        )

    def is_confirmed(self, provider: str, external_id: str) -> bool:
        row = self.db.one(
            "SELECT status FROM external_refs WHERE provider=? AND external_id=?",
            (provider, external_id),
        )
        return bool(row and row["status"] == "CONFIRMED")

    # ---- comparison -------------------------------------------------------
    def compare(self, provider: str, external_id: str, internal_amount_minor: int | None,
                external_amount_minor: int | None) -> dict:
        """Compare internal state vs external state; open a dispute on mismatch.

        This is the core §67 loop: internal vs external. Equal amounts confirm
        the reference; a mismatch opens a dispute and downgrades the ref.
        """
        if internal_amount_minor is None or external_amount_minor is None:
            status = "PENDING"
            dispute_id = None
        elif internal_amount_minor == external_amount_minor:
            status = "CONFIRMED"
            dispute_id = None
        else:
            status = "MISMATCH"
            dispute_id = "rcn_" + uuid.uuid4().hex[:12]
            self.db.execute(
                "INSERT INTO reconciliation_disputes (id, provider, external_id,"
                " internal_amount_minor, external_amount_minor, detail)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                (dispute_id, provider, external_id, internal_amount_minor,
                 external_amount_minor,
                 f"internal={internal_amount_minor} external={external_amount_minor}"),
            )
            self.events.publish("RiskTriggered", {
                "kind": "reconciliation_mismatch", "provider": provider,
                "external_id": external_id, "dispute_id": dispute_id})
            self.audit.record("reconciliation", "dispute_opened", f"{provider}:{external_id}",
                              {"dispute_id": dispute_id,
                               "internal": internal_amount_minor,
                               "external": external_amount_minor})
        self.db.execute(
            "UPDATE external_refs SET status=? WHERE provider=? AND external_id=?",
            (status, provider, external_id),
        )
        return {"provider": provider, "external_id": external_id,
                "status": status, "dispute_id": dispute_id}

    def resolve_dispute(self, dispute_id: str, resolution: str,
                        corrected_amount_minor: int | None = None) -> None:
        """Close a dispute after human/automated resolution. `resolution` is
        free text; if a corrected amount is given, the external ref is updated
        to the provider's truth (provider is the source of truth, §67)."""
        row = self.db.one("SELECT * FROM reconciliation_disputes WHERE id=?", (dispute_id,))
        if not row:
            raise KeyError(f"unknown dispute {dispute_id!r}")
        if row["status"] == "RESOLVED":
            raise ReconciliationError(f"dispute {dispute_id} already resolved")
        self.db.execute(
            "UPDATE reconciliation_disputes SET status='RESOLVED', resolved_at=datetime('now')"
            " WHERE id=?",
            (dispute_id,),
        )
        if corrected_amount_minor is not None:
            self.db.execute(
                "UPDATE external_refs SET amount_minor=?, status='CONFIRMED',"
                " confirmed_at=datetime('now') WHERE provider=? AND external_id=?",
                (corrected_amount_minor, row["provider"], row["external_id"]),
            )
        self.audit.record("reconciliation", "dispute_resolved", dispute_id,
                          {"resolution": resolution, "corrected": corrected_amount_minor})

    def open_disputes(self) -> list[dict]:
        return [dict(r) for r in self.db.query(
            "SELECT * FROM reconciliation_disputes WHERE status='OPEN' ORDER BY opened_at"
        )]
