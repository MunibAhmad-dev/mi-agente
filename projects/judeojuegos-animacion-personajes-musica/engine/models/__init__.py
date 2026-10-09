"""Model registry + router (Master Prompt §10, §56).

The registry holds capability metadata per model; the router picks the best
*available* model for a modality/mode combination. Nothing is hardcoded per
task. Availability is honest: a model whose weights are not installed, whose
adapter is not running, or whose VRAM does not fit is reported as unavailable
with a reason — never silently substituted by something worse (quality guard).
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select

from engine.kernel.models import ModelRecord
from engine.licenses import LicenseBlocked, LicenseFirewall
from engine.logging_conf import get_logger

logger = get_logger("models")

MODALITIES = ("llm", "image", "video", "audio", "music", "embedding", "3d")
MODES = ("FAST", "BALANCED", "QUALITY", "MAX_QUALITY")

_MODE_WEIGHTS = {
    "FAST": (0.3, 0.7),          # (quality, speed)
    "BALANCED": (0.5, 0.5),
    "QUALITY": (0.8, 0.2),
    "MAX_QUALITY": (1.0, 0.0),
}


class ModelUnavailable(Exception):
    def __init__(self, modality: str, reasons: list[str]) -> None:
        self.modality = modality
        self.reasons = reasons
        super().__init__(f"no available {modality} model: {'; '.join(reasons)}")


def _row_dict(row: ModelRecord) -> dict[str, Any]:
    return {
        "id": row.id,
        "name": row.name,
        "version": row.version,
        "modality": row.modality,
        "capabilities": row.capabilities or [],
        "quality": row.quality,
        "speed": row.speed,
        "vram_gb": row.vram_gb,
        "ram_gb": row.ram_gb,
        "cpu_ok": row.cpu_ok,
        "context": row.context,
        "license_name": row.license_name,
        "quantization": row.quantization,
        "strengths": row.strengths or [],
        "weaknesses": row.weaknesses or [],
        "adapter": row.adapter,
        "availability": row.availability,
        "availability_detail": row.availability_detail,
        "active": row.active,
        "notes": row.notes,
    }


class ModelRegistry:
    def __init__(self, session_factory, firewall: LicenseFirewall) -> None:
        self.Session = session_factory
        self.firewall = firewall

    def register(
        self,
        name: str,
        modality: str,
        *,
        quality: float = 0.0,
        speed: float = 0.0,
        vram_gb: float = 0.0,
        ram_gb: float = 0.0,
        cpu_ok: bool = True,
        context: int = 0,
        license_name: str = "",
        capabilities: list[str] | None = None,
        strengths: list[str] | None = None,
        weaknesses: list[str] | None = None,
        adapter: str = "",
        version: str = "",
        quantization: str = "",
        availability: str = "unavailable",
        availability_detail: str = "",
        active: bool = True,
        license_override_reason: str | None = None,
        notes: str = "",
    ) -> dict:
        if modality not in MODALITIES:
            raise ValueError(f"modality must be one of {MODALITIES}")
        if not 0.0 <= quality <= 1.0 or not 0.0 <= speed <= 1.0:
            raise ValueError("quality and speed must be within [0, 1]")
        if active and license_name:
            # Licensing firewall gate (Master Prompt §4): activation requires an
            # APPROVED verdict unless an explicit override reason is recorded.
            self.firewall.gate(license_name, override_reason=license_override_reason)
        with self.Session() as s:
            row = s.scalar(select(ModelRecord).where(ModelRecord.name == name))
            if row is None:
                row = ModelRecord(name=name, modality=modality)
                s.add(row)
            row.version = version or row.version
            row.quality = quality
            row.speed = speed
            row.vram_gb = vram_gb
            row.ram_gb = ram_gb
            row.cpu_ok = cpu_ok
            row.context = context
            row.license_name = license_name
            row.capabilities = capabilities or []
            row.strengths = strengths or []
            row.weaknesses = weaknesses or []
            row.adapter = adapter
            row.quantization = quantization
            row.availability = availability
            row.availability_detail = availability_detail
            row.active = active
            row.notes = notes
            s.commit()
            return _row_dict(row)

    def list(self, modality: str | None = None) -> list[dict]:
        with self.Session() as s:
            q = select(ModelRecord).order_by(ModelRecord.name)
            if modality:
                q = q.where(ModelRecord.modality == modality)
            rows = s.scalars(q).all()
        return [_row_dict(r) for r in rows]

    def get(self, name: str) -> dict | None:
        with self.Session() as s:
            row = s.scalar(select(ModelRecord).where(ModelRecord.name == name))
            return _row_dict(row) if row else None

    def set_availability(self, name: str, available: bool, detail: str = "") -> dict:
        with self.Session() as s:
            row = s.scalar(select(ModelRecord).where(ModelRecord.name == name))
            if row is None:
                raise KeyError(name)
            row.availability = "available" if available else "unavailable"
            row.availability_detail = detail
            s.commit()
            return _row_dict(row)

    def seed_defaults(self) -> int:
        """Seed researched candidate models (roadmap §6). All start unavailable:
        GPU is disabled by decision and no weights are installed — the router
        must refuse them with reasons, never pretend they work."""
        seeded = 0
        defaults = [
            # name, modality, quality, speed, vram, cpu_ok, license, adapter
            ("qwen3-7b", "llm", 0.78, 0.45, 0.0, True, "qwen3", "llama_cpp"),
            ("qwen3-14b", "llm", 0.84, 0.30, 0.0, True, "qwen3", "llama_cpp"),
            ("qwen-image", "image", 0.86, 0.40, 22.0, False, "qwen-image", "diffusers"),
            ("flux.1-schnell", "image", 0.74, 0.85, 12.0, False, "flux.1-schnell", "diffusers"),
            ("sdxl-base", "image", 0.72, 0.55, 10.0, False, "sdxl", "diffusers"),
            ("wan2.2-14b", "video", 0.88, 0.15, 24.0, False, "wan2.2", "diffusers"),
            ("wan2.2-5b", "video", 0.72, 0.45, 12.0, False, "wan2.2", "diffusers"),
            ("kokoro-82m", "audio", 0.75, 0.90, 0.0, True, "kokoro", "kokoro"),
            ("ace-step", "music", 0.80, 0.50, 10.0, False, "ace-step", "ace_step"),
        ]
        detail = "weights not installed / GPU disabled by user decision (2026-09-07)"
        for name, modality, quality, speed, vram, cpu_ok, license_name, adapter in defaults:
            if self.get(name) is None:
                try:
                    # RESTRICTED licenses (e.g. sdxl OpenRAIL-M) are seeded with an
                    # explicit, recorded override — never silently (Master Prompt §4).
                    override = (
                        "seeded with documented OpenRAIL-M restrictions"
                        if self.firewall.verdict_for(license_name) == "RESTRICTED"
                        else None
                    )
                    self.register(
                        name, modality, quality=quality, speed=speed, vram_gb=vram,
                        cpu_ok=cpu_ok, license_name=license_name, adapter=adapter,
                        availability="unavailable", availability_detail=detail,
                        license_override_reason=override,
                    )
                    seeded += 1
                except LicenseBlocked as exc:  # firewall refused (e.g. flux.1-dev) — recorded, not fatal
                    logger.warning("seed skipped %s: %s", name, exc)
        return seeded


class ModelRouter:
    def __init__(self, session_factory, firewall: LicenseFirewall, min_quality: float = 0.4) -> None:
        self.Session = session_factory
        self.firewall = firewall
        self.min_quality = min_quality

    def preview(
        self,
        modality: str,
        mode: str = "BALANCED",
        *,
        vram_available_gb: float = 0.0,
        min_quality: float | None = None,
        allow_below_floor: bool = False,
    ) -> dict[str, Any]:
        """Evaluate every candidate; return the best eligible one plus the full
        evaluation trace (used by the dashboard and by tests). Never raises for
        'nothing available' — that returns selected=None with reasons, so callers
        can surface the truth (Master Prompt §71)."""
        if mode not in MODES:
            raise ValueError(f"mode must be one of {MODES}")
        floor = self.min_quality if min_quality is None else min_quality
        wq, ws = _MODE_WEIGHTS[mode]
        candidates: list[dict[str, Any]] = []
        with self.Session() as s:
            rows = s.scalars(
                select(ModelRecord).where(ModelRecord.modality == modality).order_by(ModelRecord.name)
            ).all()
            snapshot = [dict(_row_dict(r)) for r in rows]
        for m in snapshot:
            reasons: list[str] = []
            if not m["active"]:
                reasons.append("inactive")
            verdict = self.firewall.verdict_for(m["license_name"]) if m["license_name"] else "UNKNOWN"
            if m["license_name"] and verdict != "APPROVED":
                reasons.append(f"license {m['license_name']}={verdict}")
            if m["availability"] != "available":
                reasons.append(m["availability_detail"] or "unavailable")
            if m["vram_gb"] > 0:
                if vram_available_gb < m["vram_gb"]:
                    reasons.append(f"needs {m['vram_gb']} GB VRAM (available {vram_available_gb})")
            elif not m["cpu_ok"]:
                reasons.append("requires GPU")
            if m["quality"] < floor and not allow_below_floor:
                reasons.append(
                    f"quality {m['quality']:.2f} below floor {floor:.2f} (quality guard, §56)"
                )
            score = round(wq * m["quality"] + ws * m["speed"], 4)
            candidates.append({"name": m["name"], "score": score, "eligible": not reasons, "reasons": reasons})
        eligible = [c for c in candidates if c["eligible"]]
        eligible.sort(key=lambda c: (-c["score"], c["name"]))
        selected = eligible[0]["name"] if eligible else None
        return {
            "modality": modality,
            "mode": mode,
            "min_quality": floor,
            "allow_below_floor": allow_below_floor,
            "selected": selected,
            "candidates": candidates,
            "reasons": [] if selected else [r for c in candidates for r in c["reasons"]],
        }

    def select(
        self,
        modality: str,
        mode: str = "BALANCED",
        *,
        vram_available_gb: float = 0.0,
        min_quality: float | None = None,
        allow_below_floor: bool = False,
    ) -> dict[str, Any]:
        """Select the best eligible model or raise ModelUnavailable."""
        result = self.preview(
            modality, mode, vram_available_gb=vram_available_gb,
            min_quality=min_quality, allow_below_floor=allow_below_floor,
        )
        if result["selected"] is None:
            raise ModelUnavailable(modality, result["reasons"])
        with self.Session() as s:
            row = s.scalar(select(ModelRecord).where(ModelRecord.name == result["selected"]))
        return _row_dict(row)
