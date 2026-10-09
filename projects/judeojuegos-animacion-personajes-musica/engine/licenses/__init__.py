"""Licensing firewall (Master Prompt §4).

Central gate for every model, tool and dependency. Rules:

- Open source is NEVER assumed to mean free use. Each component carries explicit
  code/weights/dataset license fields, a commercial-use flag, and a verdict.
- Verdicts: APPROVED / RESTRICTED / BLOCKED / UNKNOWN (absent entry = UNKNOWN).
- The gate is enforced where components are adopted: the model registry refuses
  to activate a model whose license is not APPROVED unless an explicit override
  reason is recorded (Master Prompt §56 analogue for licensing).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from sqlalchemy import select

from engine.kernel.models import LicenseEntry
from engine.logging_conf import get_logger

logger = get_logger("licenses")

VERDICTS = ("APPROVED", "RESTRICTED", "BLOCKED", "UNKNOWN")
REGISTRY_PATH = Path(__file__).resolve().parent / "registry.json"


class LicenseBlocked(Exception):
    """Raised when the firewall refuses a component."""

    def __init__(self, name: str, verdict: str, reason: str) -> None:
        self.name = name
        self.verdict = verdict
        self.reason = reason
        super().__init__(f"license firewall blocked '{name}' (verdict={verdict}): {reason}")


def _entry_dict(row: LicenseEntry) -> dict[str, Any]:
    return {
        "name": row.name,
        "version": row.version,
        "code_license": row.code_license,
        "weights_license": row.weights_license,
        "dataset_license": row.dataset_license,
        "commercial_use": row.commercial_use,
        "redistribution": row.redistribution,
        "modification": row.modification,
        "restrictions": row.restrictions,
        "source": row.source,
        "checked_date": row.checked_date,
        "verdict": row.verdict,
        "notes": row.notes,
    }


class LicenseFirewall:
    def __init__(self, session_factory, registry_path: Path | None = None) -> None:
        self.Session = session_factory
        self.registry_path = Path(registry_path) if registry_path else REGISTRY_PATH

    # ------------------------------------------------------------------- seed

    def seed_if_empty(self) -> int:
        """Load the shipped registry into the DB once (idempotent)."""
        with self.Session() as s:
            if s.scalar(select(LicenseEntry.name).limit(1)) is not None:
                return 0
            entries = json.loads(self.registry_path.read_text(encoding="utf-8"))
            for e in entries:
                s.add(LicenseEntry(**{k: v for k, v in e.items() if k in _ENTRY_FIELDS}))
            s.commit()
            logger.info("seeded %d license entries from %s", len(entries), self.registry_path.name)
            return len(entries)

    # ------------------------------------------------------------------- CRUD

    def register(self, entry: dict[str, Any]) -> dict:
        name = entry.get("name")
        if not name:
            raise ValueError("license entry requires a name")
        verdict = entry.get("verdict", "UNKNOWN")
        if verdict not in VERDICTS:
            raise ValueError(f"verdict must be one of {VERDICTS}")
        with self.Session() as s:
            row = s.get(LicenseEntry, name)
            if row is None:
                row = LicenseEntry(name=name)
                s.add(row)
            for field in _ENTRY_FIELDS:
                if field in entry and field != "name":
                    setattr(row, field, entry[field])
            s.commit()
            return _entry_dict(row)

    def get(self, name: str) -> dict | None:
        with self.Session() as s:
            row = s.get(LicenseEntry, name)
            return _entry_dict(row) if row else None

    def list(self) -> list[dict]:
        with self.Session() as s:
            rows = s.scalars(select(LicenseEntry).order_by(LicenseEntry.name)).all()
        return [_entry_dict(r) for r in rows]

    # ------------------------------------------------------------------- gate

    def verdict_for(self, name: str) -> str:
        entry = self.get(name)
        return entry["verdict"] if entry else "UNKNOWN"

    def gate(self, name: str, override_reason: str | None = None) -> str:
        """Return the verdict if allowed, else raise LicenseBlocked.

        RESTRICTED/BLOCKED/UNKNOWN pass only with an explicit override reason,
        which is logged (never silent — Master Prompt §71 spirit).
        """
        verdict = self.verdict_for(name)
        if verdict == "APPROVED":
            return verdict
        if override_reason:
            logger.warning(
                "license override: %s verdict=%s reason=%s", name, verdict, override_reason
            )
            return verdict
        entry = self.get(name)
        reason = (entry or {}).get("restrictions") or "no registry entry — research its license first"
        raise LicenseBlocked(name, verdict, reason)


_ENTRY_FIELDS = (
    "name", "version", "code_license", "weights_license", "dataset_license",
    "commercial_use", "redistribution", "modification", "restrictions",
    "source", "checked_date", "verdict", "notes",
)
