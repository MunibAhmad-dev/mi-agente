"""Shared fixtures: a fresh in-memory system per test."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from aeos.core.audit import Audit
from aeos.core.config import load_settings
from aeos.core.db import Database
from aeos.core.decisions import Decisions
from aeos.core.events import EventBus
from aeos.core.migrations import migrate
from aeos.agents.economics import AgentEconomics
from aeos.agents.factory import AgentFactory
from aeos.agents.fitness import FitnessEngine
from aeos.agents.genome import Genome
from aeos.agents.hall_of_fame import HallOfFame
from aeos.agents.lifecycle import Lifecycle
from aeos.agents.cemetery import Cemetery
from aeos.economics.allocation import AllocationInputs, CapitalAllocationEngine
from aeos.economics.ledger import Ledger
from aeos.economics.risk import RiskEngine, RiskLimits
from aeos.economics.treasury import Treasury
from aeos.evolution.dna import StrategyDNA
from aeos.evolution.engine import EvolutionEngine
from aeos.evolution.predictions import PredictionLedger


@pytest.fixture()
def system():
    """(db, components...) fully bootstrapped in-memory system."""
    db = Database(":memory:")
    migrate(db)
    events = EventBus(db)
    audit = Audit(db)
    ledger = Ledger(db)
    treasury = Treasury(db, ledger, events, audit, reserve_floor=0.30)
    lifecycle = Lifecycle(db, events, audit)
    factory = AgentFactory(db, events, audit, max_population=8)
    eco = AgentEconomics(db)
    dna = StrategyDNA(db, events, audit)
    fitness = FitnessEngine()
    predictions = PredictionLedger(db, events)
    evolution = EvolutionEngine(db, events, audit, factory, eco, treasury, dna, fitness)
    return {
        "db": db, "events": events, "audit": audit, "ledger": ledger,
        "treasury": treasury, "lifecycle": lifecycle, "factory": factory,
        "eco": eco, "dna": dna, "fitness": fitness, "predictions": predictions,
        "evolution": evolution,
    }


@pytest.fixture()
def genome():
    return Genome(identity="test-agent", mission="test mission", generation=1)


@pytest.fixture()
def seeded_treasury(system):
    """Treasury seeded with 10,000.00; reserve floor respected."""
    treasury = system["treasury"]
    # deposit 30% reserve, 70% operating
    treasury.deposit("RESERVE", 3_000_00)
    treasury.deposit("OPERATING", 7_000_00)
    return treasury
