"""Money helpers: all core economics use integer minor units (cents) to avoid
floating-point drift in accounting (spec §16, §145).

Decimal conversion uses ROUND_HALF_UP (accounting convention), never Python's
banker's rounding (probe F4: to_minor(2.675) was 268 instead of 268¢→267.5¢
edge; with HALF_UP it is unambiguous at the half-cent boundary).
"""
from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

MINOR = 100


def to_minor(amount: float | str | Decimal) -> int:
    """Convert a decimal amount to integer minor units (ROUND_HALF_UP)."""
    d = Decimal(str(amount))
    if d < 0:
        raise ValueError("amount must be non-negative")
    return int((d * MINOR).to_integral_value(rounding=ROUND_HALF_UP))


def to_major(minor: int) -> float:
    return minor / MINOR


def fmt(minor: int) -> str:
    sign = "-" if minor < 0 else ""
    m = abs(minor)
    return f"{sign}{m // MINOR}.{m % MINOR:02d}"
