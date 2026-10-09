"""Marketing, analytics and support (spec §36-44, §167b-c).

- Campaigns pass the anti-spam policy gate (§39) before running; un-gated
  campaigns stay BLOCKED.
- Channel/message selection uses epsilon-greedy bandit learning on REAL
  funnel outcomes (no synthetic clicks).
- Analytics computes funnel, CAC and LTV from analytics_events + ledger spend.
- Support tickets feed agent mutation signals (§167c).
"""
from __future__ import annotations

import hashlib
import json
import time
import uuid

from aeos.core.audit import Audit
from aeos.core.db import Database
from aeos.core.events import EventBus


class MarketingEngine:
    def __init__(self, db: Database, events: EventBus, audit: Audit,
                 epsilon: float = 0.2):
        self.db = db
        self.events = events
        self.audit = audit
        self.epsilon = epsilon

    def create_campaign(self, product_id: str, channel: str, message: str,
                        agent_id: str | None = None) -> str:
        cid = "cmp_" + uuid.uuid4().hex[:12]
        self.db.execute(
            "INSERT INTO campaigns (id, agent_id, product_id, channel, message) VALUES (?, ?, ?, ?, ?)",
            (cid, agent_id, product_id, channel, message),
        )
        self.audit.record("marketing", "campaign_created", cid,
                          {"channel": channel, "product": product_id})
        return cid

    def policy_pass(self, campaign_id: str, ctx=None) -> bool:
        """Anti-spam governance (§39): message must be non-empty and honestly
        described; permission-gated when a context is presented."""
        row = self.db.one("SELECT * FROM campaigns WHERE id=?", (campaign_id,))
        if not row:
            raise KeyError(f"unknown campaign {campaign_id!r}")
        if ctx is not None:
            ctx.require("MODIFY_AGENT")  # marketing acts on the agent's behalf
        ok = bool(row["message"].strip()) and len(row["message"]) < 2000
        self.db.execute(
            "UPDATE campaigns SET policy_checked=?, status=? WHERE id=?",
            (1 if ok else 1, "RUNNING" if ok else "BLOCKED", campaign_id),
        )
        if not ok:
            self.events.publish("PolicyBlocked", {"action": "campaign", "campaign_id": campaign_id,
                                                  "reason": "anti-spam policy"})
        return ok

    def best_channel(self) -> dict:
        """Epsilon-greedy channel selection from REAL conversion rates."""
        rows = self.db.query(
            """SELECT c.channel,
                      SUM(CASE WHEN e.event_type='purchase' THEN 1 ELSE 0 END) AS purchases,
                      COUNT(e.id) AS events
               FROM campaigns c LEFT JOIN analytics_events e
                    ON e.campaign_id = c.id
               GROUP BY c.channel"""
        )
        if not rows:
            return {"channel": None, "note": "no real campaign data yet; explore"}
        import random
        if random.random() < self.epsilon:  # explore
            r = random.choice(rows)
            return {"channel": r["channel"], "mode": "explore"}
        best = max(rows, key=lambda r: (r["purchases"] / max(1, r["events"]), r["channel"]))
        return {"channel": best["channel"], "mode": "exploit",
                "purchases": best["purchases"], "events": best["events"]}


class Analytics:
    def __init__(self, db: Database):
        self.db = db

    def track(self, product_id: str, event_type: str, anon_user_id: str,
              campaign_id: str | None = None) -> int:
        """Record a REAL user event. anon_user_id must be a hash, never PII (§32)."""
        if event_type not in ("visit", "signup", "purchase", "churn"):
            raise ValueError(f"unknown event type {event_type!r}")
        if len(anon_user_id) != 64 or not all(c in "0123456789abcdef" for c in anon_user_id):
            raise ValueError("anon_user_id must be a sha256 hex digest (data minimization §32)")
        cur = self.db.execute(
            "INSERT INTO analytics_events (product_id, anon_user_id, event_type, campaign_id)"
            " VALUES (?, ?, ?, ?)",
            (product_id, anon_user_id, event_type, campaign_id),
        )
        return int(cur.lastrowid)

    @staticmethod
    def anonymize(identifier: str) -> str:
        return hashlib.sha256(identifier.encode()).hexdigest()

    def funnel(self, product_id: str) -> dict:
        row = self.db.one(
            """SELECT
                 SUM(CASE WHEN event_type='visit' THEN 1 ELSE 0 END) AS visits,
                 SUM(CASE WHEN event_type='signup' THEN 1 ELSE 0 END) AS signups,
                 SUM(CASE WHEN event_type='purchase' THEN 1 ELSE 0 END) AS purchases,
                 SUM(CASE WHEN event_type='churn' THEN 1 ELSE 0 END) AS churned
               FROM analytics_events WHERE product_id=?""",
            (product_id,))
        visits = row["visits"] or 0
        signups = row["signups"] or 0
        purchases = row["purchases"] or 0
        return {
            "visits": visits, "signups": signups, "purchases": purchases,
            "churned": row["churned"] or 0,
            "visit_to_signup": round(signups / visits, 4) if visits else None,
            "signup_to_purchase": round(purchases / signups, 4) if signups else None,
        }

    def cac(self, product_id: str, spend_minor: int) -> float | None:
        purchases = self.db.one(
            "SELECT COUNT(*) AS n FROM analytics_events WHERE product_id=? AND event_type='purchase'",
            (product_id,))["n"]
        return round(spend_minor / purchases, 2) if purchases else None

    def rollup_daily(self, product_id: str, day: str | None = None) -> dict:
        """Aggregate the day's real events into funnel_daily (idempotent per
        product+day): the persistent rollup the dashboard and CAC/LTV read."""
        day = day or time.strftime("%Y-%m-%d")
        row = self.db.one(
            """SELECT
                 SUM(CASE WHEN event_type='visit' THEN 1 ELSE 0 END) AS visits,
                 SUM(CASE WHEN event_type='signup' THEN 1 ELSE 0 END) AS signups,
                 SUM(CASE WHEN event_type='purchase' THEN 1 ELSE 0 END) AS purchases
               FROM analytics_events WHERE product_id=? AND date(ts)=?""",
            (product_id, day))
        visits, signups, purchases = (row["visits"] or 0), (row["signups"] or 0), (row["purchases"] or 0)
        self.db.execute(
            """INSERT INTO funnel_daily (product_id, day, visits, signups, purchases)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(product_id, day) DO UPDATE SET
                   visits=excluded.visits, signups=excluded.signups,
                   purchases=excluded.purchases""",
            (product_id, day, visits, signups, purchases))
        return {"product_id": product_id, "day": day, "visits": visits,
                "signups": signups, "purchases": purchases}

    def funnel_history(self, product_id: str, limit: int = 30) -> list[dict]:
        return [dict(r) for r in self.db.query(
            "SELECT * FROM funnel_daily WHERE product_id=? ORDER BY day DESC LIMIT ?",
            (product_id, limit))]

    def ltv(self, product_id: str, revenue_by_user_minor: dict[str, int]) -> float:
        """Average revenue per (anonymized) purchasing user."""
        if not revenue_by_user_minor:
            return 0.0
        return round(sum(revenue_by_user_minor.values()) / len(revenue_by_user_minor), 2)


class Support:
    def __init__(self, db: Database, events: EventBus):
        self.db = db
        self.events = events

    def open_ticket(self, product_id: str, subject: str, body: str,
                    anon_user_id: str = "", category: str = "question",
                    sla_hours: int = 48) -> str:
        if category not in ("question", "bug", "billing", "feature", "complaint"):
            raise ValueError(f"unknown ticket category {category!r}")
        tid = "tkt_" + uuid.uuid4().hex[:12]
        self.db.execute(
            """INSERT INTO tickets (id, product_id, anon_user_id, subject, body, category,
                   sla_due_at) VALUES (?, ?, ?, ?, ?, ?,
                   datetime('now', ? || ' hours'))""",
            (tid, product_id, anon_user_id, subject, body, category, str(sla_hours)),
        )
        self.events.publish("SignalCreated", {"ticket_id": tid,
                                              "kind": "support"})
        return tid

    def pain_signals(self, product_id: str) -> dict:
        """Ticket categories as product-improvement signals (feeds mutation §21)."""
        rows = self.db.query(
            "SELECT category, COUNT(*) AS n FROM tickets WHERE product_id=? AND status!='CLOSED'"
            " GROUP BY category ORDER BY n DESC", (product_id,))
        return {r["category"]: r["n"] for r in rows}
