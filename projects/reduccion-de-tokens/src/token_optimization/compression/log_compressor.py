"""Log compressor (spec §20): collapse repeated messages, keep errors verbatim."""
from __future__ import annotations

import re
from typing import Optional

from ..core.ir import ContextItem, RiskLevel
from .base import Compressor, TokenFn

_TS = re.compile(r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?")
_NUM = re.compile(r"\b\d+(?:\.\d+)?\b")
_HEX = re.compile(r"\b[0-9a-fA-F]{8,}\b")
_LEVEL = re.compile(r"\b(ERROR|WARN|WARNING|FATAL|CRITICAL)\b", re.IGNORECASE)


class LogCompressor(Compressor):
    name = "logs"
    content_types = ("logs",)

    def _compress_one(self, item: ContextItem, token_fn: TokenFn, budget: Optional[int]) -> str:
        if item.risk == RiskLevel.CRITICAL:
            return item.content
        lines = item.content.splitlines()
        pointer = item.retrieval_pointer or item.hash
        out: list[str] = []
        last_sig: Optional[str] = None
        run_count = 0
        run_first = ""
        run_level = ""
        current_ts = ""

        def flush() -> None:
            nonlocal last_sig, run_count, run_first, run_level
            if last_sig is None:
                return
            if run_count == 1:
                out.append(run_first)
            else:
                out.append(
                    f"{run_first} [+{run_count - 1} repeats collapsed; recoverable:{pointer}]"
                )
            last_sig, run_count, run_first = None, 0, ""

        for line in lines:
            ts = _TS.search(line)
            level = "ERROR" if _LEVEL.search(line) else ""
            sig = _HEX.sub("<hex>", _NUM.sub("<n>", _TS.sub("<ts>", line)))
            is_error = bool(level)
            if is_error:
                flush()
                out.append(line)  # errors/warnings always verbatim (spec §20)
                last_sig, run_count = None, 0
                continue
            if sig == last_sig:
                run_count += 1
                continue
            flush()
            last_sig, run_count, run_first = sig, 1, line
        flush()
        if len(out) < len(lines):
            out.append(f"[logs: {len(lines) - len(out)} lines collapsed; original recoverable:{pointer}]")
        return "\n".join(out)
