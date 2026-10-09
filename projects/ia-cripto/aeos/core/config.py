"""Configuration split per spec §152: development/test/paper/shadow/limited_live/production.

No secrets are ever hard-coded; everything comes from environment variables
(AEOS_ prefix). Importing this module must never raise for missing credentials -
capabilities degrade gracefully and report what they need (§60, §165).
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


VALID_MODES = ("development", "test", "paper", "shadow", "limited_live", "production")


@dataclass(frozen=True)
class Settings:
    mode: str = "development"
    data_dir: Path = field(default_factory=lambda: Path("data"))
    db_path: Path = field(default_factory=lambda: Path("data/aeos.db"))
    # treasury limits (spec §17, §52)
    reserve_floor: float = 0.30        # fraction of total treasury
    max_experiment_budget: float = 0.10
    max_business_allocation: float = 0.40
    max_investment_allocation: float = 0.35
    # risk limits (spec §51)
    max_position_pct: float = 0.10
    max_daily_loss_pct: float = 0.05
    max_drawdown_pct: float = 0.20
    max_fee_bps: float = 50.0
    max_slippage_bps: float = 100.0
    # agent population (spec §119)
    max_population: int = 64
    # fitness weights (spec §15)
    fitness_weights: dict = field(default_factory=lambda: {
        "profit": 1.0, "growth": 0.8, "survival": 0.9, "learning": 0.7,
        "optionality": 0.4, "robustness": 0.6, "risk": 1.0, "cost": 0.8,
        "uncertainty": 0.6, "capital_consumption": 0.7, "concentration": 0.5,
    })

    def ensure_dirs(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)


def load_settings(mode: str | None = None, env: dict | None = None) -> Settings:
    """Load settings from environment (AEOS_* variables). Unknown mode -> error."""
    e = env if env is not None else os.environ
    m = mode or e.get("AEOS_MODE", "development")
    if m not in VALID_MODES:
        raise ValueError(f"invalid AEOS_MODE {m!r}; expected one of {VALID_MODES}")

    def f(name: str, default: float) -> float:
        try:
            return float(e.get(name, default))
        except (TypeError, ValueError):
            return default

    def i(name: str, default: int) -> int:
        try:
            return int(e.get(name, default))
        except (TypeError, ValueError):
            return default

    data_dir = Path(e.get("AEOS_DATA_DIR", "data"))
    return Settings(
        mode=m,
        data_dir=data_dir,
        db_path=Path(e.get("AEOS_DB_PATH", str(data_dir / "aeos.db"))),
        reserve_floor=f("AEOS_RESERVE_FLOOR", 0.30),
        max_experiment_budget=f("AEOS_MAX_EXPERIMENT_BUDGET", 0.10),
        max_business_allocation=f("AEOS_MAX_BUSINESS_ALLOCATION", 0.40),
        max_investment_allocation=f("AEOS_MAX_INVESTMENT_ALLOCATION", 0.35),
        max_position_pct=f("AEOS_MAX_POSITION_PCT", 0.10),
        max_daily_loss_pct=f("AEOS_MAX_DAILY_LOSS_PCT", 0.05),
        max_drawdown_pct=f("AEOS_MAX_DRAWDOWN_PCT", 0.20),
        max_fee_bps=f("AEOS_MAX_FEE_BPS", 50.0),
        max_slippage_bps=f("AEOS_MAX_SLIPPAGE_BPS", 100.0),
        max_population=i("AEOS_MAX_POPULATION", 64),
    )
