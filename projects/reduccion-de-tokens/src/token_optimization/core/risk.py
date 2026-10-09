"""Compression risk engine (spec §13).

The engine classifies content into LOW / MEDIUM / HIGH / CRITICAL. CRITICAL
content must be preserved verbatim or be exactly recoverable.
"""
from __future__ import annotations

import re

from .ir import RiskLevel, Role

# Negation patterns that must survive any compression (spec §27 example).
_NEGATION_PATTERNS = (
    r"\bDO NOT\b",
    r"\bNEVER\b",
    r"\bdon'?t\b",
    r"\bno debo\b",
    r"\bno debes\b",
    r"\bnunca\b",
    r"\bprohibido\b",
)

_CRITICAL_PATTERNS = (
    (re.compile(p, re.IGNORECASE), 3.0) for p in _NEGATION_PATTERNS
)


class RiskEngine:
    """Assigns a risk level to a piece of content given its role."""

    def __init__(self) -> None:
        self._negations = tuple(re.compile(p, re.IGNORECASE) for p in _NEGATION_PATTERNS)
        self._exact_command = re.compile(r"\b(delete|drop|rm -rf|truncate|exec|eval)\b", re.IGNORECASE)
        self._identifier = re.compile(r"\b(?:[A-Za-z]:\\[\w\\.-]+|/[\w./-]{3,}|0x[0-9a-fA-F]{6,})\b")
        self._number = re.compile(r"\b\d[\d_,.]*\b")
        self._credential = re.compile(r"\b(api[_-]?key|secret|password|token|ghp_[A-Za-z0-9]{20,})\b", re.IGNORECASE)

    def assess(self, content: str, role: Role = Role.USER) -> RiskLevel:
        score = 0.0
        low = content.lower()

        if any(rx.search(content) for rx in self._negations):
            score += 3.0
        if self._credential.search(content):
            score += 3.0
        if self._exact_command.search(low):
            score += 2.0
        if self._identifier.search(content):
            score += 1.5
        if len(self._number.findall(content)) >= 3:
            score += 1.0
        if "```" in content:
            score += 1.0

        if role in (Role.SYSTEM, Role.DEVELOPER):
            score += 3.0  # system/developer instructions are CRITICAL by policy
        elif role == Role.TOOL:
            score += 0.5

        if score >= 3.0:
            return RiskLevel.CRITICAL
        if score >= 2.0:
            return RiskLevel.HIGH
        if score >= 1.0:
            return RiskLevel.MEDIUM
        return RiskLevel.LOW

    def has_unprotected_negation(self, original: str, compressed: str) -> bool:
        """True if a negation present in original was lost or flipped in compressed."""
        for rx in self._negations:
            for m in rx.finditer(original):
                window = original[max(0, m.start() - 80): m.end() + 80]
                marker = window[-40:].strip()[-30:]
                if marker and marker not in compressed:
                    return True
        return False
