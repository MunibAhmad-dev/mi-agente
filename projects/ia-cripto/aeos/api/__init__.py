"""HTTP API (§94). Lazy AeosApi export so `python -m aeos.api.server` doesn't
double-import the module (RuntimeWarning) before execution."""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from aeos.api.server import AeosApi

__all__ = ["AeosApi"]


def __getattr__(name: str):
    if name == "AeosApi":
        from aeos.api.server import AeosApi
        return AeosApi
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
