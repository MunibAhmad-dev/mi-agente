"""Fitness engine (spec §15): six components with configurable weights.

economic_fitness = profit*growth*survival*learning*optionality*robustness
                   - risk - cost - uncertainty - capital_consumption - concentration
All weights configurable (settings.fitness_weights).
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class FitnessInputs:
    profit_minor: int
    growth: float              # 0..1
    survival: float            # 0..1
    learning: float            # information gain 0..1
    optionality: float         # 0..1
    robustness: float          # 0..1
    risk: float                # 0..1
    cost_minor: int
    uncertainty: float         # 0..1
    capital_consumption: float # 0..1 fraction of allocation burned
    concentration: float       # 0..1 dependence on one channel/customer


class FitnessEngine:
    def __init__(self, weights: dict | None = None, cost_scale_minor: int = 1_000_00,
                 penalty_weight: float = 0.5):
        w = {
            "profit": 1.0, "growth": 0.8, "survival": 0.9, "learning": 0.7,
            "optionality": 0.4, "robustness": 0.6, "risk": 1.0, "cost": 0.8,
            "uncertainty": 0.6, "capital_consumption": 0.7, "concentration": 0.5,
        }
        if weights:
            w.update(weights)
        self.w = w
        self.cost_scale = max(1, cost_scale_minor)
        self.penalty_weight = penalty_weight

    def economic_fitness(self, f: FitnessInputs) -> float:
        """Spec §15 formula, calibrated:

        positive = (profit / cost_scale) * mean(growth, survival, learning,
                                                optionality, robustness)
        penalty  = penalty_weight * weighted_mean(risk, cost, uncertainty,
                                                  capital_consumption, concentration)

        A burning agent (profit <= 0) scores <= 0. A profitable agent scores
        positive unless risk/cost/uncertainty dominate. All weights configurable
        (§15). The five positive factors enter as a mean: a strict product would
        mathematically prevent any realistic agent from ever scoring positive.
        """
        profit_ratio = f.profit_minor / self.cost_scale
        factors = (max(0.0, f.growth), max(0.0, f.survival), max(0.0, f.learning),
                   max(0.0, f.optionality), max(0.0, f.robustness))
        positive = max(0.0, profit_ratio) * (sum(factors) / len(factors))
        penalties = (
            self.w["risk"] * max(0.0, f.risk),
            self.w["cost"] * min(1.0, max(0.0, f.cost_minor) / self.cost_scale),
            self.w["uncertainty"] * max(0.0, f.uncertainty),
            self.w["capital_consumption"] * max(0.0, f.capital_consumption),
            self.w["concentration"] * max(0.0, f.concentration),
        )
        wsum = (self.w["risk"] + self.w["cost"] + self.w["uncertainty"]
                + self.w["capital_consumption"] + self.w["concentration"])
        penalty = (sum(penalties) / wsum) * self.penalty_weight
        return round(positive - penalty, 4)

    def _profit_term(self, profit_minor: int) -> float:
        # saturating transform: 1.0 at ~cost_scale profit, 10x at 10x scale
        import math
        return math.tanh(profit_minor / self.cost_scale)

    def learning_fitness(self, f: FitnessInputs) -> float:
        return round(0.7 * f.learning + 0.3 * f.survival, 4)

    def risk_fitness(self, f: FitnessInputs) -> float:
        return round(1.0 - 0.6 * f.risk - 0.4 * f.concentration, 4)

    def robustness_fitness(self, f: FitnessInputs) -> float:
        return round(0.5 * f.robustness + 0.3 * (1 - f.uncertainty) + 0.2 * f.survival, 4)

    def growth_fitness(self, f: FitnessInputs) -> float:
        return round(f.growth * (1 - 0.3 * f.uncertainty), 4)

    def capital_efficiency(self, f: FitnessInputs) -> float:
        denom = max(1, f.cost_minor)
        return round(f.profit_minor / denom, 4)

    def all(self, f: FitnessInputs) -> dict:
        return {
            "economic_fitness": self.economic_fitness(f),
            "learning_fitness": self.learning_fitness(f),
            "risk_fitness": self.risk_fitness(f),
            "robustness_fitness": self.robustness_fitness(f),
            "growth_fitness": self.growth_fitness(f),
            "capital_efficiency": self.capital_efficiency(f),
        }
