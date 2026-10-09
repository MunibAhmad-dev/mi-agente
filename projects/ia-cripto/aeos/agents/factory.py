"""Agent Factory (spec §119-120): spawn control + economics bootstrap.

Spawn control: no agent is created without a positive information-gain-vs-cost
check and population headroom. Resource limits come from the genome.
"""
from __future__ import annotations

from aeos.agents.genome import Genome, GenomeStore, new_agent_id
from aeos.core.audit import Audit
from aeos.core.db import Database
from aeos.core.events import EventBus


class SpawnDenied(Exception):
    pass


class AgentFactory:
    def __init__(self, db: Database, events: EventBus, audit: Audit,
                 max_population: int = 64):
        self.db = db
        self.events = events
        self.audit = audit
        self.genomes = GenomeStore(db)
        self.max_population = max_population

    def population(self) -> int:
        row = self.db.one(
            "SELECT COUNT(*) AS n FROM agents WHERE state NOT IN"
            " ('FAILED','KILLED','BANKRUPT','EXPIRED','BLOCKED','REPLACED')"
        )
        return int(row["n"])

    def spawn(self, genome: Genome, expected_information_gain: float,
              compute_cost_minor: int, capital_cost_minor: int,
              diversity_gain: float = 0.5, authorization=None) -> str:
        """Create an agent if spawn control passes (§119).

        When an AuthorizationContext is presented it must hold SPAWN_AGENT.
        """
        if authorization is not None and not isinstance(authorization, str):
            authorization.require("SPAWN_AGENT")
        genome.validate()
        if self.population() >= self.max_population:
            raise SpawnDenied("population limit reached")
        gain_per_cost = expected_information_gain / max(1, compute_cost_minor + capital_cost_minor)
        if expected_information_gain <= 0 or gain_per_cost < 1e-6:
            raise SpawnDenied(
                f"spawn control: information gain {expected_information_gain} too low "
                f"for cost {compute_cost_minor + capital_cost_minor}"
            )
        if diversity_gain < 0.1:
            raise SpawnDenied("spawn control: negligible diversity gain")

        agent_id = new_agent_id()
        with self.db.transaction() as conn:
            conn.execute(
                "INSERT INTO agents (id, generation, parent_id, state, mission) VALUES (?, ?, ?, 'CREATED', ?)",
                (agent_id, genome.generation, genome.parents[0] if genome.parents else None, genome.mission),
            )
            conn.execute(
                "INSERT INTO agent_economics (agent_id) VALUES (?)", (agent_id,),
            )
        self.genomes.save(genome, agent_id)
        self.events.publish("AgentCreated", {
            "agent_id": agent_id, "generation": genome.generation,
            "parents": genome.parents,
            "expected_information_gain": expected_information_gain,
        })
        self.audit.record("factory", "spawn", agent_id, {
            "generation": genome.generation, "info_gain": expected_information_gain,
        })
        return agent_id

    def get(self, agent_id: str) -> dict:
        row = self.db.one("SELECT * FROM agents WHERE id=?", (agent_id,))
        if not row:
            raise KeyError(f"unknown agent {agent_id!r}")
        return dict(row)

    def list_agents(self, state: str | None = None) -> list[dict]:
        if state:
            rows = self.db.query("SELECT * FROM agents WHERE state=? ORDER BY created_at", (state,))
        else:
            rows = self.db.query("SELECT * FROM agents ORDER BY created_at")
        return [dict(r) for r in rows]
