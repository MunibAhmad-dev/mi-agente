"""Agent trajectory compressor (spec §19): collapse repeated observations,
preserve errors, decisions and state changes; pointer to full history."""
from __future__ import annotations

import re
from typing import Optional

from ..core.ir import ContextItem, RiskLevel
from .base import Compressor, TokenFn

_NUM = re.compile(r"\b\d+(?:\.\d+)?\b")
_HEX = re.compile(r"\b[0-9a-fA-F]{8,}\b")
_IMPORTANT = re.compile(r"(error|fail|exception|decision|state_change|critical|abort|retry)", re.IGNORECASE)


class TrajectoryCompressor(Compressor):
    """ACON-style deterministic front-end: structural trajectory reduction.

    (The learned/LLM variants of ACON would plug in behind the same
    ContextCompressor interface; this deterministic version runs local and
    free, so the router prefers it first per spec §63.)
    """

    name = "trajectory"
    content_types = ("agent_trajectory",)

    def _compress_one(self, item: ContextItem, token_fn: TokenFn, budget: Optional[int]) -> str:
        if item.risk == RiskLevel.CRITICAL:
            return item.content
        lines = item.content.splitlines()
        pointer = item.retrieval_pointer or item.hash
        out: list[str] = []
        last_sig: Optional[str] = None
        run = 0
        first_line = ""

        def flush() -> None:
            nonlocal last_sig, run, first_line
            if last_sig is None:
                return
            if run == 1:
                out.append(first_line)
            else:
                out.append(f"{first_line}  [x{run} repeated observations collapsed; recoverable:{pointer}]")
            last_sig, run = None, 0

        for line in lines:
            if _IMPORTANT.search(line):
                flush()
                out.append(line)  # errors/decisions always verbatim
                continue
            sig = _HEX.sub("<hex>", _NUM.sub("<n>", line.strip().lower()))
            if sig == last_sig:
                run += 1
                continue
            flush()
            last_sig, run, first_line = sig, 1, line
        flush()
        if len(out) < len(lines):
            out.append(f"[trajectory: {len(lines) - len(out)} redundant lines collapsed; recoverable:{pointer}]")
        return "\n".join(out)
