"""Opportunity engine (spec §30-31): detect, score and gate real opportunities.

Scoring (§31):
  EV = expected_profit * probability_success * (information_value + optionality)
       - capital_cost - risk - uncertainty - time - competition - operational_cost
Opportunities below threshold are NOT executed - DO NOTHING is a valid decision
(§5). Every opportunity cites its evidence (observation ids, §75).
"""
from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field

from aeos.core.audit import Audit
from aeos.core.db import Database
from aeos.core.events import EventBus
from aeos.world.brain import NoRealDataAvailable, WorldBrain


@dataclass
class OpportunityScores:
    demand: float = 0.5            # 0..1
    competition_openness: float = 0.5
    margin: float = 0.5
    risk: float = 0.5              # 0..1 (higher = riskier)
    uncertainty: float = 0.5
    information_value: float = 0.0
    capital_required_minor: int = 0
    time_to_market_days: int = 30


@dataclass
class ScoringWeights:
    demand: float = 1.0
    competition: float = 0.8
    margin: float = 1.0
    risk: float = 1.0
    uncertainty: float = 0.7
    info_value: float = 0.6
    capital: float = 1.0           # per 100.00
    time: float = 0.3              # per 30 days
    threshold: float = 0.15        # below => REJECT (do nothing)


class OpportunityEngine:
    def __init__(self, db: Database, events: EventBus, audit: Audit, brain: WorldBrain,
                 weights: ScoringWeights | None = None):
        self.db = db
        self.events = events
        self.audit = audit
        self.brain = brain
        self.w = weights or ScoringWeights()

    # ---- detection --------------------------------------------------------
    def detect(self, market: str, problem: str, evidence_observation_ids: list[int],
               segment: str = "") -> dict:
        """Register an opportunity anchored to REAL observations (§75). Refuses
        to create one from nothing - evidence ids must exist (anti-simulation)."""
        if not evidence_observation_ids:
            raise ValueError("opportunity requires real evidence observations (§75)")
        found = self.db.one(
            f"SELECT COUNT(*) AS n FROM world_observations WHERE id IN"
            f" ({','.join('?' * len(evidence_observation_ids))})",
            tuple(evidence_observation_ids),
        )
        if found["n"] != len(set(evidence_observation_ids)):
            raise NoRealDataAvailable("evidence references non-existent observations")
        oid = "opp_" + uuid.uuid4().hex[:12]
        evidence = [{"observation_id": i} for i in evidence_observation_ids]
        self.db.execute(
            """INSERT INTO opportunities (id, market, segment, problem, evidence_json)
               VALUES (?, ?, ?, ?, ?)""",
            (oid, market, segment, problem, json.dumps(evidence)),
        )
        self.events.publish("OpportunityDetected", {"opportunity_id": oid, "market": market})
        self.audit.record("opportunities", "detect", oid, {"market": market,
                                                           "evidence": len(evidence)})
        return {"id": oid, "market": market, "problem": problem}

    # ---- scoring (§31) -------------------------------------------------------
    def score(self, opportunity_id: str, s: OpportunityScores | None = None) -> dict:
        s = s or OpportunityScores()
        w = self.w
        positive = (w.demand * s.demand + w.competition * s.competition_openness
                    + w.margin * s.margin + w.info_value * s.information_value)
        negative = (w.risk * s.risk + w.uncertainty * s.uncertainty
                    + w.capital * min(1.0, s.capital_required_minor / 10_000_00)
                    + w.time * min(1.0, s.time_to_market_days / 90))
        denom = (w.demand + w.competition + w.margin + w.info_value
                 + w.risk + w.uncertainty + w.capital + w.time)
        ev = round((positive - negative) / denom, 4)
        confidence = round(max(0.0, 1.0 - (s.risk * 0.5 + s.uncertainty * 0.5)), 4)
        decision = "APPROVED" if ev >= w.threshold else "REJECTED"
        self.db.execute(
            """UPDATE opportunities SET demand_score=?, competition_score=?, margin_score=?,
                   risk=?, uncertainty=?, information_value=?, capital_required_minor=?,
                   time_to_market_days=?, expected_value=?, confidence=?, status=?,
                   scored_at=datetime('now')
               WHERE id=?""",
            (s.demand, s.competition_openness, s.margin, s.risk, s.uncertainty,
             s.information_value, s.capital_required_minor, s.time_to_market_days,
             ev, confidence, decision, opportunity_id),
        )
        self.audit.record("opportunities", "scored", opportunity_id,
                          {"ev": ev, "decision": decision})
        return {"id": opportunity_id, "expected_value": ev, "confidence": confidence,
                "decision": decision, "threshold": w.threshold}

    # ---- portfolio view (§103) ------------------------------------------------
    def portfolio(self) -> dict:
        rows = self.db.query(
            "SELECT status, COUNT(*) AS n, AVG(expected_value) AS avg_ev"
            " FROM opportunities GROUP BY status"
        )
        return {r["status"]: {"count": r["n"], "avg_expected_value": round(r["avg_ev"] or 0, 4)}
                for r in rows}

    def approved(self) -> list[dict]:
        return [dict(r) for r in self.db.query(
            "SELECT * FROM opportunities WHERE status='APPROVED' ORDER BY expected_value DESC"
        )]
