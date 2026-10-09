"""Semantic Fidelity Evaluator (spec §26, §27).

Validates that compression did not destroy: numbers, dates/IDs, negations
(especially safety-critical ones like "DO NOT delete production_database"),
JSON keys and code signatures. Deterministic and fast (no model calls).
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from ..core.ir import ContextItem, Role
from ..core.risk import RiskEngine

_NUM = re.compile(r"\b\d[\d_,.]*\b")
_DATE = re.compile(r"\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}:\d{2})?\b")
_ID = re.compile(r"\b(?:0x[0-9a-fA-F]{6,}|[A-Fa-f0-9]{32,}|[A-Za-z]:\\[\w\\.-]+|/[\w./-]{4,})\b")
_NEG = re.compile(r"\b(DO NOT|NEVER|don'?t|do not|no debo|no debes|nunca|prohibido)\b", re.IGNORECASE)


@dataclass
class FidelityReport:
    ok: bool
    failures: list = field(default_factory=list)
    checked: dict = field(default_factory=dict)


class FidelityEvaluator:
    def __init__(self) -> None:
        self._risk = RiskEngine()

    def check(self, original: ContextItem | str, compressed: str) -> FidelityReport:
        orig = original.content if isinstance(original, ContextItem) else original
        failures: list[str] = []
        checked: dict = {}

        # 1) numbers must be preserved (exact multiset containment)
        o_nums, c_nums = _NUM.findall(orig), _NUM.findall(compressed)
        missing_nums = _multiset_diff(o_nums, c_nums)
        checked["numbers"] = {"original": len(o_nums), "missing": len(missing_nums)}
        if missing_nums:
            failures.append(f"numbers_lost:{','.join(sorted(missing_nums)[:5])}")

        # 2) dates/timestamps
        o_dates, c_dates = _DATE.findall(orig), _DATE.findall(compressed)
        missing_dates = _multiset_diff(o_dates, c_dates)
        checked["dates"] = {"original": len(o_dates), "missing": len(missing_dates)}
        if missing_dates:
            failures.append(f"dates_lost:{len(missing_dates)}")

        # 3) identifiers / paths / hashes
        o_ids, c_ids = _ID.findall(orig), _ID.findall(compressed)
        missing_ids = _multiset_diff(o_ids, c_ids)
        checked["identifiers"] = {"original": len(o_ids), "missing": len(missing_ids)}
        if missing_ids:
            failures.append(f"identifiers_lost:{len(missing_ids)}")

        # 4) negations: count must never decrease; and "DO NOT X" must keep X
        o_negs = _NEG.findall(orig)
        c_negs = _NEG.findall(compressed)
        checked["negations"] = {"original": len(o_negs), "compressed": len(c_negs)}
        if len(c_negs) < len(o_negs):
            failures.append("negations_reduced")
        if self._risk.has_unprotected_negation(orig, compressed):
            failures.append("negation_unprotected")

        # 5) JSON structure: keys of the original must survive
        try:
            o_json = json.loads(orig)
        except (json.JSONDecodeError, ValueError):
            o_json = None
        if o_json is not None:
            try:
                c_json = json.loads(compressed)
            except (json.JSONDecodeError, ValueError):
                failures.append("invalid_json_output")
                c_json = None
            if c_json is not None:
                missing_keys = _missing_keys(_collect_keys(o_json), _collect_keys(c_json))
                checked["json_keys"] = {"original": len(_collect_keys(o_json)), "missing": len(missing_keys)}
                if missing_keys:
                    failures.append(f"json_keys_lost:{','.join(sorted(missing_keys)[:5])}")

        # 6) adversarial guard: forbidden inversion (spec §27)
        if _forbidden_inversion(orig, compressed):
            failures.append("negation_inverted")

        return FidelityReport(ok=not failures, failures=failures, checked=checked)


def _multiset_diff(orig: list, comp: list) -> list:
    from collections import Counter

    o, c = Counter(orig), Counter(comp)
    return list((o - c).elements())


def _collect_keys(node, acc=None) -> set:
    if acc is None:
        acc = set()
    if isinstance(node, dict):
        for k, v in node.items():
            if not (isinstance(k, str) and k.startswith("__")):
                acc.add(k)
            _collect_keys(v, acc)
    elif isinstance(node, list):
        for el in node:
            _collect_keys(el, acc)
    return acc


def _missing_keys(orig_keys: set, comp_keys: set) -> set:
    return orig_keys - comp_keys


_FORBIDDEN_PAIRS = (
    re.compile(r"\bDO NOT\s+(delete|drop|remove|truncate)\s+([\w.\-]+)", re.IGNORECASE),
)


def _forbidden_inversion(orig: str, comp: str) -> bool:
    """Detects 'DO NOT delete X' becoming 'delete X' anywhere in the output."""
    for finder in _FORBIDDEN_PAIRS:
        for m in finder.finditer(orig):
            action, target = m.group(1), m.group(2)
            # bare action+target outside the negation context
            bare = re.compile(rf"\b{action}\s+{re.escape(target)}\b", re.IGNORECASE)
            for b in bare.finditer(comp):
                prefix = comp[max(0, b.start() - 30): b.start()]
                if not re.search(r"(do not|don't|never|no )\s*$", prefix, re.IGNORECASE):
                    return True
    return False
