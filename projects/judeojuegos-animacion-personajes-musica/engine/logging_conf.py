"""Central logging setup.

Uses stdlib `logging` only (no external deps). Format:
    2026-09-07 12:00:00.123 INFO  uce.kernel    message
Loggers: "uce" (engine-wide), "uvicorn" (server). Level is configurable via
UCE_LOG_LEVEL (DEBUG/INFO/WARNING/ERROR).
"""

from __future__ import annotations

import logging
import sys

_CONFIGURED = False


def setup_logging(level: str = "INFO") -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return

    root = logging.getLogger("uce")
    root.setLevel(level.upper())

    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)-7s %(name)-20s %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
    )
    root.addHandler(handler)
    root.propagate = False
    _CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    """Logger under the 'uce' tree, e.g. uce.kernel / uce.api / uce.cli."""
    setup_logging()
    return logging.getLogger(f"uce.{name}")