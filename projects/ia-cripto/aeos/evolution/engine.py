"""Evolution Engine (spec §19, §134): the economic Darwinism loop.

EVALUATE -> RANK -> SELECT -> EXTRACT TRAITS -> MUTATE -> RECOMBINE -> SPAWN,
with diversity pressure (§102) and capital reallocation to winners (§19).
Real-world testing happens between generations through the experiment engine;
this engine consumes realized outcomes (never synthetic ones) and drives the
next generation.
"""
from __future__ import annotations

import random

from aeos.agents.economics import AgentEconomics
from aeos.agents.factory import AgentFactory
from aeos.agents.fitness import FitnessEngine, FitnessInputs
from aeos.core.audit import Audit
from aeos.core.db import Database
from aeos.core.events import EventBus
from aeos.economics.treasury import Treasury
from aeos.evolution.dna import StrategyDNA


class EvolutionEngine:
    def __init__(self, db: Database, events: EventBus, audit: Audit,
                 factory: AgentFactory, eco: AgentEconomics, treasury: Treasury,
                 dna: StrategyDNA, fitness: FitnessEngine,
                 selection_pressure: float = 0.5, rng: random.Random | None = None):
        self.db = db
        self.events = events
        self.audit = audit
        self.factory = factory
        self.eco = eco
        self.treasury = treasury
        self.dna = dna
        self.fitness = fitness
        self.selection_pressure = selection_pressure
        self.rng = rng or random.Random()

    # ---- evaluate --------------------------------------------------------
    def evaluate(self, agent_id: str, inputs: FitnessInputs) -> dict:
        scores = self.fitness.all(inputs)
        self.db.execute(
            "UPDATE agent_economics SET information_gain=? WHERE agent_id=?",
            (inputs.learning, agent_id),
        )
        self.audit.record("evolution", "evaluate", agent_id, scores)
        return scores

    def rank(self) -> list[dict]:
        """Rank living agents by realized economics (profit, ROI, survival)."""
        rows = self.db.query(
            """SELECT a.id, a.generation, e.revenue_minor, e.expenses_minor,
                      e.allocated_minor, e.survival_ticks
               FROM agents a JOIN agent_economics e ON e.agent_id = a.id
               WHERE a.state NOT IN ('FAILED','KILLED','BANKRUPT','EXPIRED','BLOCKED','REPLACED')"""
        )
        ranked = []
        for r in rows:
            profit = r["revenue_minor"] - r["expenses_minor"]
            roi = profit / max(1, r["allocated_minor"])
            ranked.append({
                "agent_id": r["id"], "generation": r["generation"],
                "profit_minor": profit, "roi": round(roi, 4),
                "survival_ticks": r["survival_ticks"],
            })
        ranked.sort(key=lambda x: (x["profit_minor"], x["roi"]), reverse=True)
        return ranked

    def select_survivors(self, ranked: list[dict]) -> list[dict]:
        k = max(1, int(len(ranked) * (1.0 - self.selection_pressure)))
        return ranked[:k]

    # ---- reallocate capital to winners (§19) ------------------------------
    def reallocate(self, ranked: list[dict], bucket: str,
                   bonus_fraction: float = 0.20, min_bonus_minor: int = 1_00) -> list[dict]:
        """Give winners extra capital from the bucket. Failures are NOT swallowed:
        a blocked reallocation (policy, insufficient funds, dead agent) is
        recorded as a RiskTriggered event and surfaced in the result (§67:
        never hide discrepancies)."""
        moves: list[dict] = []
        blocked: list[dict] = []
        pool = int(self.treasury.available(bucket) * bonus_fraction)
        if pool <= 0 or not ranked:
            return moves
        winners = [r for r in ranked if r["profit_minor"] > 0]
        if not winners:
            return moves
        total_profit = sum(w["profit_minor"] for w in winners)
        for w in winners:
            share = max(min_bonus_minor, int(pool * w["profit_minor"] / total_profit))
            share = min(share, self.treasury.available(bucket))
            if share <= 0:
                continue
            try:
                self.treasury.allocate(bucket, w["agent_id"], share,
                                       reason="evolution winner bonus",
                                       authorization="evolution:reallocate")
                moves.append({"agent_id": w["agent_id"], "bonus_minor": share})
            except Exception as exc:
                blocked.append({"agent_id": w["agent_id"], "reason": str(exc)})
                self.events.publish("RiskTriggered", {
                    "kind": "reallocation_blocked", "agent_id": w["agent_id"],
                    "reason": str(exc)})
        if blocked:
            self.audit.record("evolution", "reallocation_blocked", bucket,
                              {"blocked": blocked})
        return moves

    # ---- generation summary ------------------------------------------------
    def generation_stats(self, generation: int) -> dict:
        rows = self.db.query(
            """SELECT
                 COUNT(*) AS population,
                 SUM(CASE WHEN a.state IN ('FAILED','KILLED','BANKRUPT','EXPIRED','BLOCKED','REPLACED') THEN 1 ELSE 0 END) AS dead,
                 AVG(e.revenue_minor - e.expenses_minor) AS avg_profit
               FROM agents a LEFT JOIN agent_economics e ON e.agent_id=a.id
               WHERE a.generation=?""",
            (generation,),
        )
        r = rows[0]
        return {
            "generation": generation,
            "population": int(r["population"] or 0),
            "dead": int(r["dead"] or 0),
            "avg_profit_minor": round(r["avg_profit"] or 0, 2),
        }
