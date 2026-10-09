"""Character engine (Master Prompt §16, §17).

A character is persistent: identity, personality, lore, and named slots that
map to assets (face, body, hair, clothing, ... voice, music theme).
`consistency()` reports which required slots are filled — the gate every
downstream pipeline (sheets, turnarounds, 2D→3D) must consult before it may
regenerate a view from scratch.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select

from engine.kernel.models import Asset, Character

SLOTS = (
    "face", "body", "hands", "hair", "clothing", "accessories",
    "expressions", "poses", "view_2d", "model_3d", "rig", "facial_rig",
    "animations", "voice", "music_theme",
)


class CharacterService:
    def __init__(self, session_factory) -> None:
        self.Session = session_factory

    def create(
        self,
        project_id: str,
        name: str,
        *,
        identity: dict[str, Any] | None = None,
        personality: str = "",
        lore: str = "",
    ) -> dict:
        name = (name or "").strip()
        if not name:
            raise ValueError("character name is required")
        with self.Session() as s:
            row = Character(
                project_id=project_id, name=name, identity=identity or {},
                personality=personality, lore=lore, slots={},
            )
            s.add(row)
            s.commit()
            return self._dict(row)

    def list(self, project_id: str) -> list[dict]:
        with self.Session() as s:
            rows = s.scalars(
                select(Character).where(Character.project_id == project_id).order_by(Character.created_at)
            ).all()
        return [self._dict(r) for r in rows]

    def get(self, character_id: str) -> dict:
        with self.Session() as s:
            row = s.get(Character, character_id)
        if row is None:
            raise KeyError(character_id)
        return self._dict(row)

    def update(
        self,
        character_id: str,
        *,
        name: str | None = None,
        identity: dict[str, Any] | None = None,
        personality: str | None = None,
        lore: str | None = None,
    ) -> dict:
        with self.Session() as s:
            row = s.get(Character, character_id)
            if row is None:
                raise KeyError(character_id)
            if name is not None:
                if not name.strip():
                    raise ValueError("character name cannot be empty")
                row.name = name.strip()
            if identity is not None:
                row.identity = identity
            if personality is not None:
                row.personality = personality
            if lore is not None:
                row.lore = lore
            s.commit()
            return self._dict(row)

    def set_slot(self, character_id: str, slot: str, asset_id: str | None) -> dict:
        """Attach an asset to a slot (asset_id=None clears it)."""
        if slot not in SLOTS:
            raise ValueError(f"slot must be one of {SLOTS}")
        with self.Session() as s:
            row = s.get(Character, character_id)
            if row is None:
                raise KeyError(character_id)
            slots = dict(row.slots or {})
            if asset_id is None:
                slots.pop(slot, None)
            else:
                asset = s.get(Asset, asset_id)
                if asset is None:
                    raise KeyError(asset_id)
                if asset.project_id != row.project_id:
                    raise ValueError("asset belongs to a different project")
                slots[slot] = asset_id
            row.slots = slots
            s.commit()
            return self._dict(row)

    def consistency(self, character_id: str) -> dict[str, Any]:
        """Which slots are filled vs missing (Master Prompt §17). Missing slots
        are exactly the views a pipeline may NOT invent from scratch."""
        char = self.get(character_id)
        slots = char["slots"] or {}
        present, missing = [], []
        for slot in SLOTS:
            (present if slots.get(slot) else missing).append(slot)
        return {
            "character_id": character_id,
            "name": char["name"],
            "complete": not missing,
            "present": present,
            "missing": missing,
            "slots": slots,
        }

    def _dict(self, row: Character) -> dict:
        return {
            "id": row.id, "project_id": row.project_id, "name": row.name,
            "identity": row.identity or {}, "personality": row.personality,
            "lore": row.lore, "slots": row.slots or {},
            "created_at": row.created_at.isoformat(), "updated_at": row.updated_at.isoformat(),
        }
