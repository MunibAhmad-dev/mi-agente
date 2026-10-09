"""Agent Genome (spec §10): complete heritable spec with immutable versioning.

Any material change produces a NEW version; historical versions are never
modified (enforced by primary key and by convention - the API only exposes
`mutate()` which appends).
"""
from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field, fields
from typing import Any

from aeos.core.db import Database

GENOME_FIELDS = (
    # identity / lineage
    "identity", "mission", "generation", "parents", "ancestors",
    # market understanding
    "audience", "customer_segment", "problem", "pain_point", "need",
    # offer
    "product", "offer", "pricing", "pricing_model", "distribution",
    # positioning
    "value_proposition", "positioning",
    # go-to-market
    "channel", "message", "brand", "ux", "sales", "marketing",
    "acquisition", "retention",
    # execution
    "models", "tools", "skills", "workflow", "memory_strategy",
    "reasoning_strategy", "experiment_strategy",
    # limits
    "budget_minor", "capital_limit_minor", "resource_limits", "time_limit",
    "risk_profile",
    # criteria
    "success_criteria", "failure_criteria", "death_criteria",
    # exploration
    "exploration_rate", "exploitation_rate",
    # policies
    "mutation_policy", "recombination_policy",
)


@dataclass
class Genome:
    identity: str
    mission: str = ""
    generation: int = 0
    parents: list[str] = field(default_factory=list)
    ancestors: list[str] = field(default_factory=list)
    audience: str = ""
    customer_segment: str = ""
    problem: str = ""
    pain_point: str = ""
    need: str = ""
    product: str = ""
    offer: str = ""
    pricing: str = ""
    pricing_model: str = "one_time"
    distribution: str = ""
    value_proposition: str = ""
    positioning: str = ""
    channel: str = ""
    message: str = ""
    brand: str = ""
    ux: str = ""
    sales: str = ""
    marketing: str = ""
    acquisition: str = ""
    retention: str = ""
    models: list[str] = field(default_factory=list)
    tools: list[str] = field(default_factory=list)
    skills: list[str] = field(default_factory=list)
    workflow: str = ""
    memory_strategy: str = "episodic+semantic"
    reasoning_strategy: str = "llm+deterministic-gates"
    experiment_strategy: str = "bandit"
    budget_minor: int = 0
    capital_limit_minor: int = 0
    resource_limits: dict = field(default_factory=lambda: {
        "max_tokens": 100_000, "max_runtime_s": 3_600, "max_network_calls": 1_000,
        "max_external_actions": 10,
    })
    time_limit: str = "30d"
    risk_profile: str = "balanced"
    success_criteria: dict = field(default_factory=lambda: {"profit_minor": 1})
    failure_criteria: dict = field(default_factory=lambda: {"burn_fraction": 1.0})
    death_criteria: dict = field(default_factory=lambda: {"runway_days": 0})
    exploration_rate: float = 0.3
    exploitation_rate: float = 0.7
    mutation_policy: str = "single_trait"
    recombination_policy: str = "trait_union"

    def validate(self) -> None:
        if not self.identity:
            raise ValueError("genome.identity is required")
        if self.exploration_rate + self.exploitation_rate > 1.0 + 1e-9:
            raise ValueError("exploration + exploitation must not exceed 1.0")
        if self.capital_limit_minor and self.budget_minor > self.capital_limit_minor:
            raise ValueError("budget exceeds capital_limit")

    def to_json(self) -> str:
        self.validate()
        return json.dumps({k: getattr(self, k) for k in GENOME_FIELDS}, sort_keys=True, default=str)

    @classmethod
    def from_json(cls, raw: str, strict: bool = False) -> "Genome":
        """Deserialize a genome. strict=True (P-14 fix) rejects unknown fields
        instead of silently discarding them - corruption of historical data is
        surfaced, not hidden."""
        data = json.loads(raw)
        valid = {f.name for f in fields(cls)}
        unknown = set(data) - valid
        if unknown:
            if strict:
                raise ValueError(f"unknown genome fields: {sorted(unknown)}")
            data = {k: v for k, v in data.items() if k in valid}
        return cls(**data)


class GenomeStore:
    """Persists immutable genome versions (§10)."""

    def __init__(self, db: Database):
        self.db = db

    def save(self, genome: Genome, agent_id: str | None = None) -> int:
        aid = agent_id or genome.identity
        row = self.db.one(
            "SELECT MAX(version) AS v FROM genome_versions WHERE agent_id=?", (aid,)
        )
        version = (row["v"] or 0) + 1
        self.db.execute(
            "INSERT INTO genome_versions (agent_id, version, genome_json) VALUES (?, ?, ?)",
            (aid, version, genome.to_json()),
        )
        return version

    def latest(self, agent_id: str) -> tuple[int, Genome] | None:
        row = self.db.one(
            "SELECT version, genome_json FROM genome_versions WHERE agent_id=?"
            " ORDER BY version DESC LIMIT 1",
            (agent_id,),
        )
        if not row:
            return None
        return row["version"], Genome.from_json(row["genome_json"])

    def version(self, agent_id: str, version: int) -> Genome | None:
        row = self.db.one(
            "SELECT genome_json FROM genome_versions WHERE agent_id=? AND version=?",
            (agent_id, version),
        )
        return Genome.from_json(row["genome_json"]) if row else None

    def lineage(self, agent_id: str) -> list[dict]:
        return [
            {"version": r["version"], "created_at": r["created_at"]}
            for r in self.db.query(
                "SELECT version, created_at FROM genome_versions WHERE agent_id=? ORDER BY version",
                (agent_id,),
            )
        ]


def new_agent_id() -> str:
    return "agt_" + uuid.uuid4().hex[:12]
