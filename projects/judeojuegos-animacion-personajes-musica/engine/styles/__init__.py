"""Style engine — persistent style entities (Master Prompt §14).

A style is data, not a LoRA: visual characteristics, palette, lighting, line,
materials, composition, texture, character/environment treatment, and reference
assets. Generation pipelines (image engine, later) consume this profile as
conditioning context alongside references.
"""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy import select

from engine.kernel.models import Asset, StyleProfile

_HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


class StyleService:
    def __init__(self, session_factory) -> None:
        self.Session = session_factory

    def create(
        self,
        project_id: str,
        name: str,
        *,
        description: str = "",
        palette: list[str] | None = None,
        lighting: str = "",
        line_style: str = "",
        materials: str = "",
        composition: str = "",
        texture: str = "",
        character_treatment: str = "",
        environment_treatment: str = "",
        ref_asset_ids: list[str] | None = None,
    ) -> dict:
        name = (name or "").strip()
        if not name:
            raise ValueError("style name is required")
        palette = palette or []
        for color in palette:
            if not _HEX_RE.match(color):
                raise ValueError(f"palette colors must be #RRGGBB, got: {color}")
        with self.Session() as s:
            if ref_asset_ids:
                found = s.scalars(select(Asset).where(Asset.id.in_(ref_asset_ids))).all()
                missing = set(ref_asset_ids) - {a.id for a in found}
                if missing:
                    raise KeyError(f"reference assets not found: {sorted(missing)}")
                for a in found:
                    if a.project_id != project_id:
                        raise ValueError(f"asset {a.id} belongs to another project")
            row = StyleProfile(
                project_id=project_id, name=name, description=description, palette=palette,
                lighting=lighting, line_style=line_style, materials=materials,
                composition=composition, texture=texture,
                character_treatment=character_treatment,
                environment_treatment=environment_treatment,
                ref_asset_ids=ref_asset_ids or [],
            )
            s.add(row)
            s.commit()
            return self._dict(row)

    def list(self, project_id: str) -> list[dict]:
        with self.Session() as s:
            rows = s.scalars(
                select(StyleProfile).where(StyleProfile.project_id == project_id).order_by(StyleProfile.created_at)
            ).all()
        return [self._dict(r) for r in rows]

    def get(self, style_id: str) -> dict:
        with self.Session() as s:
            row = s.get(StyleProfile, style_id)
        if row is None:
            raise KeyError(style_id)
        return self._dict(row)

    def update(self, style_id: str, **fields: Any) -> dict:
        if "palette" in fields and fields["palette"] is not None:
            for color in fields["palette"]:
                if not _HEX_RE.match(color):
                    raise ValueError(f"palette colors must be #RRGGBB, got: {color}")
        with self.Session() as s:
            row = s.get(StyleProfile, style_id)
            if row is None:
                raise KeyError(style_id)
            for k, v in fields.items():
                if v is not None and hasattr(row, k):
                    setattr(row, k, v)
            s.commit()
            return self._dict(row)

    def _dict(self, row: StyleProfile) -> dict:
        return {
            "id": row.id, "project_id": row.project_id, "name": row.name,
            "description": row.description, "palette": row.palette or [],
            "lighting": row.lighting, "line_style": row.line_style,
            "materials": row.materials, "composition": row.composition,
            "texture": row.texture, "character_treatment": row.character_treatment,
            "environment_treatment": row.environment_treatment,
            "ref_asset_ids": row.ref_asset_ids or [],
            "created_at": row.created_at.isoformat(), "updated_at": row.updated_at.isoformat(),
        }
