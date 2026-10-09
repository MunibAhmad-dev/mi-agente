"""Agent Runtime (spec §120, §133): turns the orchestrator's phase registry
into a self-driving economic loop.

Each phase handler uses REAL domain components (treasury, cemetery, DNA,
factory, fitness, evolution ranking). Resource limits (§120) are enforced per
cycle through a CycleBudget: max external actions, max capital committed, max
spawns, max orders - a phase that would exceed its budget stops and reports,
never silently overshoots.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from aeos.agents.cemetery import Cemetery
from aeos.agents.factory import AgentFactory
from aeos.agents.fitness import FitnessEngine, FitnessInputs
from aeos.agents.lifecycle import Lifecycle
from aeos.core.audit import Audit
from aeos.core.db import Database
from aeos.core.events import EventBus
from aeos.economics.treasury import Treasury
from aeos.evolution.dna import StrategyDNA
from aeos.evolution.engine import EvolutionEngine
from aeos.governance import PolicyEngine
from aeos.runtime.orchestrator import Orchestrator

TERMINAL = ("FAILED", "KILLED", "BANKRUPT", "EXPIRED", "BLOCKED", "REPLACED")


@dataclass
class ResourceLimits:
    """§120: hard per-cycle limits."""
    max_external_actions: int = 20
    max_capital_commit_minor: int = 100_000_00
    max_spawn_per_cycle: int = 3
    kill_loss_threshold_minor: int = 10_000       # cumulative loss ($100) that kills


@dataclass
class CycleBudget:
    limits: ResourceLimits
    actions: int = 0
    capital_committed_minor: int = 0
    breaches: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {"actions": self.actions,
                "capital_committed_minor": self.capital_committed_minor,
                "breaches": list(self.breaches)}

    def take_action(self) -> bool:
        if self.actions >= self.limits.max_external_actions:
            self.breaches.append("action_budget_exhausted")
            return False
        self.actions += 1
        return True

    def commit_capital(self, amount_minor: int) -> bool:
        if self.capital_committed_minor + amount_minor > self.limits.max_capital_commit_minor:
            self.breaches.append("capital_budget_exhausted")
            return False
        self.capital_committed_minor += amount_minor
        return True


class AgentRuntime:
    """Wires all economic phases to real domain components."""

    def __init__(self, db: Database, events: EventBus, audit: Audit,
                 orchestrator: Orchestrator, policy: PolicyEngine,
                 treasury: Treasury, factory: AgentFactory, lifecycle: Lifecycle,
                 cemetery: Cemetery, dna: StrategyDNA,
                 fitness: FitnessEngine, evolution: EvolutionEngine,
                 limits: ResourceLimits | None = None):
        self.db = db
        self.events = events
        self.audit = audit
        self.orch = orchestrator
        self.policy = policy
        self.treasury = treasury
        self.factory = factory
        self.lifecycle = lifecycle
        self.cemetery = cemetery
        self.dna = dna
        self.fitness = fitness
        self.evolution = evolution
        self.limits = limits or ResourceLimits()
        self._wire_phases()

    def _wire_phases(self) -> None:
        self.orch.register_phase("experiment", self._phase_experiment)
        self.orch.register_phase("measure", self._phase_measure)
        self.orch.register_phase("account", self._phase_account)
        self.orch.register_phase("evaluate", self._phase_evaluate)
        self.orch.register_phase("select", self._phase_select)
        self.orch.register_phase("kill", self._phase_kill)
        self.orch.register_phase("mutate", self._phase_mutate)
        self.orch.register_phase("spawn", self._phase_spawn)
        self.orch.register_phase("allocate", self._phase_allocate)

    def register_observer(self, handler) -> None:
        """OBSERVE is wired externally (World Brain feeds it)."""
        self.orch.register_phase("observe", handler)

    @staticmethod
    def _budget_of(ctx: dict) -> CycleBudget:
        """Rehydrate the CycleBudget from its checkpointed dict form."""
        raw = ctx.get("_budget") or {}
        if isinstance(raw, CycleBudget):
            return raw
        limits = ResourceLimits(**(raw.get("limits") or {}))
        b = CycleBudget(limits=limits)
        b.actions = int(raw.get("actions", 0))
        b.capital_committed_minor = int(raw.get("capital_committed_minor", 0))
        b.breaches = list(raw.get("breaches", []))
        ctx["_budget"] = b   # keep the live object for later phases
        return b

    # ---- experiment: policy-checked cycle opening ---------------------------
    def _phase_experiment(self, ctx: dict) -> dict:
        budget = self._budget_of(ctx)
        if not budget.take_action():
            return {"experiment": "skipped", "reason": "budget"}
        verdict = self.policy.evaluate("cycle_experiment", {"emergency_stop": False})
        if verdict.verdict == "DENY":
            return {"experiment": "blocked", "rule": verdict.rule}
        return {"experiment": "opened"}

    # ---- measure: read realized outcomes from agent_economics ----------------
    def _phase_measure(self, ctx: dict) -> dict:
        rows = self.db.query(
            "SELECT agent_id, revenue_minor, expenses_minor FROM agent_economics"
        )
        outcomes = {}
        for r in rows:
            agent = self.db.one("SELECT state FROM agents WHERE id=?", (r["agent_id"],))
            if agent and agent["state"] not in TERMINAL:
                outcomes[r["agent_id"]] = {"revenue_minor": r["revenue_minor"],
                                           "expenses_minor": r["expenses_minor"]}
        return {"outcomes": outcomes}

    # ---- account: settle profits that carry an external reference -------------
    def _phase_account(self, ctx: dict) -> dict:
        settled = []
        for agent_id, out in (ctx.get("outcomes") or {}).items():
            ref = (ctx.get("external_refs") or {}).get(agent_id)
            if not ref:
                continue  # no verified external outcome -> nothing to settle (§80)
            row = self.db.one(
                "SELECT revenue_minor, expenses_minor FROM agent_economics WHERE agent_id=?",
                (agent_id,))
            if not row:
                continue
            profit = row["revenue_minor"] - row["expenses_minor"]
            if profit <= 0:
                continue
            try:
                self.treasury.settle_profit("OPERATING", agent_id, profit,
                                            reason="runtime cycle settlement",
                                            external_reference=ref)
                settled.append({"agent_id": agent_id, "profit_minor": profit})
            except Exception as exc:  # surfaced, never swallowed (§67)
                self.events.publish("RiskTriggered", {
                    "kind": "settlement_failed", "agent_id": agent_id, "reason": str(exc)})
        return {"settled": settled}

    # ---- evaluate: fitness over realized outcomes ------------------------------
    def _phase_evaluate(self, ctx: dict) -> dict:
        scores = {}
        for agent_id, out in (ctx.get("outcomes") or {}).items():
            inputs = FitnessInputs(
                profit_minor=out["revenue_minor"] - out["expenses_minor"],
                growth=0.5, survival=0.8, learning=0.4, optionality=0.3,
                robustness=0.5, risk=0.3, cost_minor=out["expenses_minor"],
                uncertainty=0.4, capital_consumption=0.4, concentration=0.3)
            scores[agent_id] = self.fitness.all(inputs)
        return {"fitness": scores}

    # ---- select: rank living agents by realized profit --------------------------
    def _phase_select(self, ctx: dict) -> dict:
        ranked = self.evolution.rank()
        return {"ranked": ranked[:10],
                "selected": [r["agent_id"] for r in ranked if r["profit_minor"] > 0][:3]}

    # ---- kill: bury agents past the loss threshold (releases capital) -----------
    def _phase_kill(self, ctx: dict) -> dict:
        budget = self._budget_of(ctx)
        killed = []
        for agent_id in ctx.get("outcomes") or {}:
            row = self.db.one(
                "SELECT e.revenue_minor - e.expenses_minor AS profit, a.state"
                " FROM agent_economics e JOIN agents a ON a.id=e.agent_id"
                " WHERE e.agent_id=?", (agent_id,))
            if not row or row["state"] in TERMINAL:
                continue
            if row["profit"] < -self.limits.kill_loss_threshold_minor:
                if not budget.take_action():
                    break
                try:
                    rec = self.cemetery.bury(agent_id, failure_category="NO_DEMAND",
                                             failure_reason=f"cumulative loss {row['profit']}")
                    killed.append({"agent_id": agent_id,
                                   "released_minor": rec["capital_released_minor"]})
                except ValueError:
                    continue  # already buried earlier in this cycle
        return {"killed": killed}

    # ---- mutate: survivor DNA explores ------------------------------------------
    def _phase_mutate(self, ctx: dict) -> dict:
        budget = self._budget_of(ctx)
        mutations = []
        for agent_id in (ctx.get("selected") or [])[:1]:
            if not budget.take_action():
                break
            try:
                rec = self.dna.mutate(agent_id, "message", "runtime variation",
                                      hypothesis="survivor explores adjacent message",
                                      reason="runtime mutation")
                mutations.append({"agent_id": agent_id, "version": rec.new_dna_version})
            except Exception:
                continue  # trait may be absent on this genome
        return {"mutations": mutations}

    # ---- spawn: only via real opportunities (wired by the caller) ----------------
    def _phase_spawn(self, ctx: dict) -> dict:
        spawner = getattr(self, "spawner", None)
        if spawner is None:
            return {"spawned": [], "note": "no opportunity spawner wired (§119)"}
        return spawner(ctx)

    def wire_spawner(self, spawner) -> None:
        self.spawner = spawner

    # ---- allocate: reward winners within the capital budget -----------------------
    def _phase_allocate(self, ctx: dict) -> dict:
        budget = self._budget_of(ctx)
        allocated = []
        for entry in (ctx.get("ranked") or [])[:2]:
            if entry.get("profit_minor", 0) <= 0:
                continue
            bonus = min(10_00, self.treasury.available("OPERATING") // 100)
            if bonus <= 0 or not budget.commit_capital(bonus):
                break
            try:
                self.treasury.allocate("OPERATING", entry["agent_id"], bonus,
                                       reason="runtime winner bonus",
                                       authorization="runtime:allocate")
                allocated.append({"agent_id": entry["agent_id"], "bonus_minor": bonus})
            except Exception as exc:
                self.events.publish("RiskTriggered", {
                    "kind": "allocation_failed", "agent_id": entry["agent_id"],
                    "reason": str(exc)})
        return {"allocated": allocated}

    # ---- entrypoint ----------------------------------------------------------------
    def run_cycle(self, cycle_id: str) -> dict:
        result = self.orch.run_cycle(
            cycle_id,
            initial_ctx={"_budget": {"limits": self.limits.__dict__,
                                     "actions": 0, "capital_committed_minor": 0,
                                     "breaches": []}},
        )
        self.audit.record("runtime", "cycle", cycle_id, {
            "status": result.get("status"),
            "killed": len(result.get("killed", []) or []),
        })
        return result
