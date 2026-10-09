"""Strategy DNA (spec §20-22): extract, compare, mutate, combine, rank, transfer.

Traits cover the 12 DNA families; mutations log parent, change, hypothesis,
reason and (later) result; recombination unions traits from multiple parents
with full genealogy.
"""
from __future__ import annotations

import json
import random
import uuid
from dataclasses import dataclass

from aeos.core.audit import Audit
from aeos.core.db import Database
from aeos.core.events import EventBus

TRAIT_FAMILIES = (
    "audience", "problem", "product", "price", "channel", "message",
    "marketing", "acquisition", "retention", "model", "tool", "workflow",
)


@dataclass
class MutationRecord:
    mutation_id: str
    parent_agent: str
    parent_dna_version: int
    trait: str
    change: str
    hypothesis: str
    reason: str
    new_dna_version: int


class StrategyDNA:
    def __init__(self, db: Database, events: EventBus, audit: Audit, rng: random.Random | None = None):
        self.db = db
        self.events = events
        self.audit = audit
        self.rng = rng or random.Random()

    # ---- extract -------------------------------------------------------
    def extract_from_genome(self, agent_id: str, genome_json: str) -> int:
        """Derive initial DNA traits from a genome and store as version 1."""
        g = json.loads(genome_json)
        traits = {
            "audience": g.get("audience", ""),
            "problem": g.get("problem", ""),
            "product": g.get("product", ""),
            "price": g.get("pricing", ""),
            "channel": g.get("channel", ""),
            "message": g.get("message", ""),
            "marketing": g.get("marketing", ""),
            "acquisition": g.get("acquisition", ""),
            "retention": g.get("retention", ""),
            "model": g.get("models", []),
            "tool": g.get("tools", []),
            "workflow": g.get("workflow", ""),
        }
        return self._save(agent_id, 1, traits, None, "initial extraction from genome")

    def _save(self, agent_id: str, version: int, traits: dict,
              parent_version: int | None, note: str) -> int:
        self.db.execute(
            "INSERT INTO strategy_dna (agent_id, version, traits_json, parent_dna_version, mutation_note)"
            " VALUES (?, ?, ?, ?, ?)",
            (agent_id, version, json.dumps(traits, sort_keys=True, default=str),
             parent_version, note),
        )
        return version

    def latest(self, agent_id: str) -> tuple[int, dict] | None:
        row = self.db.one(
            "SELECT version, traits_json FROM strategy_dna WHERE agent_id=?"
            " ORDER BY version DESC LIMIT 1",
            (agent_id,),
        )
        if not row:
            return None
        return row["version"], json.loads(row["traits_json"])

    # ---- mutate --------------------------------------------------------
    def mutate(self, agent_id: str, trait: str, new_value, hypothesis: str,
               reason: str) -> MutationRecord:
        if trait not in TRAIT_FAMILIES:
            raise ValueError(f"unknown trait family {trait!r}")
        current = self.latest(agent_id)
        if not current:
            raise KeyError(f"agent {agent_id} has no strategy DNA yet")
        version, traits = current
        new_version = version + 1
        traits = dict(traits)
        traits[trait] = new_value
        self._save(agent_id, new_version, traits, version, f"mutate {trait}: {reason}")
        rec = MutationRecord(
            mutation_id=uuid.uuid4().hex[:12], parent_agent=agent_id,
            parent_dna_version=version, trait=trait, change=str(new_value),
            hypothesis=hypothesis, reason=reason, new_dna_version=new_version,
        )
        self.events.publish("AgentMutated", {
            "agent_id": agent_id, "trait": trait, "from_version": version,
            "to_version": new_version, "hypothesis": hypothesis,
        })
        self.audit.record("evolution", "mutate", agent_id,
                          {"trait": trait, "version": new_version, "reason": reason})
        return rec

    # ---- recombine -----------------------------------------------------
    def recombine(self, child_agent_id: str, parents: list[str]) -> int:
        """Union recombination: child inherits each trait from the parent whose
        DNA version is most recent for that trait (A.acquisition + B.retention + C.price)."""
        if len(parents) < 2:
            raise ValueError("recombination requires at least two parents")
        child_traits: dict = {}
        contributions: dict[str, str] = {}
        for pid in parents:
            cur = self.latest(pid)
            if not cur:
                raise KeyError(f"parent {pid} has no strategy DNA")
            _v, traits = cur
            for k, v in traits.items():
                if v and not child_traits.get(k):
                    child_traits[k] = v
                    contributions[k] = pid
        version = self._save(
            child_agent_id, 1, child_traits, None,
            "recombination of " + ",".join(parents),
        )
        self.events.publish("AgentReplicated", {
            "child": child_agent_id, "parents": parents, "contributions": contributions,
        })
        self.audit.record("evolution", "recombine", child_agent_id,
                          {"parents": parents, "contributions": contributions})
        return version

    # ---- compare / rank --------------------------------------------------
    @staticmethod
    def similarity(a: dict, b: dict) -> float:
        """Jaccard-style similarity across trait families (§102 diversity)."""
        keys = set(a) | set(b)
        if not keys:
            return 0.0
        same = sum(1 for k in keys if a.get(k) == b.get(k) and a.get(k))
        return same / len(keys)
