"""Extended API surface for the domain modules.

Registered from engine.kernel.api.create_app BEFORE the SPA catch-all so the
specific routes win. Endpoints are thin: everything goes through the Kernel's
services, never straight to the DB.
"""

from __future__ import annotations

from typing import Any

from fastapi import Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field


class LicenseIn(BaseModel):
    name: str = Field(min_length=1)
    version: str = ""
    code_license: str = ""
    weights_license: str = ""
    dataset_license: str = ""
    commercial_use: bool = False
    redistribution: bool = False
    modification: bool = False
    restrictions: str = ""
    source: str = ""
    checked_date: str = ""
    verdict: str = "UNKNOWN"
    notes: str = ""


class GateIn(BaseModel):
    override_reason: str | None = None


class ModelIn(BaseModel):
    name: str = Field(min_length=1)
    modality: str
    version: str = ""
    quality: float = 0.0
    speed: float = 0.0
    vram_gb: float = 0.0
    ram_gb: float = 0.0
    cpu_ok: bool = True
    context: int = 0
    license_name: str = ""
    capabilities: list[str] = []
    strengths: list[str] = []
    weaknesses: list[str] = []
    adapter: str = ""
    quantization: str = ""
    availability: str = "unavailable"
    availability_detail: str = ""
    active: bool = True
    license_override_reason: str | None = None
    notes: str = ""


class AvailabilityIn(BaseModel):
    available: bool
    detail: str = ""


class MemoryIn(BaseModel):
    category: str
    text: str = Field(min_length=1)
    key: str = ""
    meta: dict[str, Any] = {}


class MemorySearchIn(BaseModel):
    query: str = Field(min_length=1)
    mode: str = "keyword"
    category: str | None = None
    limit: int = Field(default=10, ge=1, le=100)


class RelationIn(BaseModel):
    to_id: str
    relation: str


class StyleIn(BaseModel):
    name: str = Field(min_length=1)
    description: str = ""
    palette: list[str] = []
    lighting: str = ""
    line_style: str = ""
    materials: str = ""
    composition: str = ""
    texture: str = ""
    character_treatment: str = ""
    environment_treatment: str = ""
    ref_asset_ids: list[str] = []


class StylePatch(BaseModel):
    name: str | None = None
    description: str | None = None
    palette: list[str] | None = None
    lighting: str | None = None
    line_style: str | None = None
    materials: str | None = None
    composition: str | None = None
    texture: str | None = None
    character_treatment: str | None = None
    environment_treatment: str | None = None


class CharacterIn(BaseModel):
    name: str = Field(min_length=1)
    identity: dict[str, Any] = {}
    personality: str = ""
    lore: str = ""


class CharacterPatch(BaseModel):
    name: str | None = None
    identity: dict[str, Any] | None = None
    personality: str | None = None
    lore: str | None = None


class SlotIn(BaseModel):
    slot: str
    asset_id: str | None = None


class QARunIn(BaseModel):
    kind: str
    subject_kind: str = "asset"  # asset | artifact
    subject_id: str
    params: dict[str, Any] = {}


class ProviderIn(BaseModel):
    name: str = Field(min_length=1)
    kind: str = "openai_compat"
    base_url: str = ""
    keys: list[str] = []
    priority: int = 0
    quota_total: int = 0


def _map_value_errors(fn):
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except (ValueError, KeyError) as exc:
            status = 404 if isinstance(exc, KeyError) else 422
            raise HTTPException(status_code=status, detail=str(exc)) from exc

    return wrapper


def register_ext(app) -> None:
    from engine.kernel.api import _can_manage, _get_owned_asset, require_admin, require_user
    from engine.resources import QuotaExceeded, ResourceSnapshot, detect
    from engine.adapters import probe_all
    from engine.qa import KINDS as QA_KINDS

    kernel = app.state.kernel

    # ------------------------------------------------- audit / events / metrics

    @app.get("/api/audit", tags=["system"])
    def run_audit_endpoint(_admin: dict = Depends(require_admin)) -> dict:
        """Run the full verification loop on a scratch kernel (slow: ~15-30s).
        Exposes the CI gate over HTTP (audit finding: CLI-only before)."""
        from engine.audit import run_audit

        areas, all_ok = run_audit()
        return {
            "all_checks_passed": all_ok,
            "overall_score": round(sum(a["score"] for a in areas) / len(areas), 1),
            "areas": areas,
        }

    @app.get("/api/events", tags=["observability"])
    def list_events(
        job_id: str | None = Query(default=None),
        topic: str | None = Query(default=None),
        limit: int = Query(default=100, ge=1, le=1000),
        _user: dict = Depends(require_user),
    ) -> dict:
        return {"events": kernel.list_events(job_id=job_id, topic=topic, limit=limit)}

    @app.get("/api/metrics", tags=["observability"])
    def metrics(_user: dict = Depends(require_user)) -> dict:
        """Prometheus-style text metrics from live DB state."""
        from sqlalchemy import func, select

        from engine.kernel.models import Job, QAReport, Task

        lines = ["# uce kernel metrics"]
        counts = kernel.job_status_counts()
        for status, n in sorted(counts.items()):
            lines.append(f'uce_jobs{{status="{status}"}} {n}')
        with kernel.Session() as s:
            tasks_total = s.scalar(select(func.count(Task.id))) or 0
            qa_total = s.scalar(select(func.count(QAReport.id))) or 0
            qa_pass = s.scalar(select(func.count(QAReport.id)).where(QAReport.passed.is_(True))) or 0
        lines.append(f"uce_tasks_total {tasks_total}")
        lines.append(f"uce_qa_reports_total {qa_total}")
        lines.append(f"uce_qa_passed_total {qa_pass}")
        lines.append(f"uce_gpu_enabled {1 if kernel.enable_gpu else 0}")
        from io import StringIO

        return Response(content="\n".join(lines) + "\n", media_type="text/plain; version=0.0.4")

    # ------------------------------------------------------------- resources

    @app.get("/api/resources", tags=["system"])
    def resources(_user: dict = Depends(require_user)) -> dict:
        snapshot = detect(kernel.enable_gpu, storage_root=kernel.storage_root)
        return {**snapshot.to_dict(), "project_quota_bytes": kernel.project_quota_bytes}

    @app.get("/api/adapters", tags=["system"])
    def adapters(_user: dict = Depends(require_user)) -> dict:
        return {"adapters": probe_all()}

    # -------------------------------------------------------- licenses (§4)

    @app.get("/api/licenses", tags=["licenses"])
    def licenses_list(_user: dict = Depends(require_user)) -> dict:
        return {"licenses": kernel.licenses.list()}

    @app.post("/api/licenses", status_code=201, tags=["licenses"])
    def licenses_add(body: LicenseIn, _admin: dict = Depends(require_admin)) -> dict:
        try:
            return kernel.licenses.register(body.model_dump())
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.get("/api/licenses/{name}", tags=["licenses"])
    def licenses_get(name: str, _user: dict = Depends(require_user)) -> dict:
        entry = kernel.licenses.get(name)
        if entry is None:
            raise HTTPException(status_code=404, detail="license entry not found")
        return entry

    @app.post("/api/licenses/{name}/gate", tags=["licenses"])
    def licenses_gate(name: str, body: GateIn, _user: dict = Depends(require_user)) -> dict:
        try:
            verdict = kernel.licenses.gate(name, override_reason=body.override_reason)
        except Exception as exc:  # LicenseBlocked
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return {"name": name, "verdict": verdict}

    # ------------------------------------------- model registry + router (§10)

    @app.get("/api/models", tags=["models"])
    def models_list(modality: str | None = Query(default=None), _user: dict = Depends(require_user)) -> dict:
        return {"models": kernel.model_registry.list(modality=modality)}

    @app.post("/api/models", status_code=201, tags=["models"])
    def models_add(body: ModelIn, _admin: dict = Depends(require_admin)) -> dict:
        try:
            return kernel.model_registry.register(**body.model_dump())
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except Exception as exc:  # LicenseBlocked
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.post("/api/models/{name}/availability", tags=["models"])
    def models_availability(name: str, body: AvailabilityIn, _admin: dict = Depends(require_admin)) -> dict:
        try:
            return kernel.model_registry.set_availability(name, body.available, body.detail)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="model not found") from exc

    @app.get("/api/models/router/preview", tags=["models"])
    def router_preview(
        modality: str = Query(...),
        mode: str = Query(default="BALANCED"),
        _user: dict = Depends(require_user),
    ) -> dict:
        snapshot = detect(kernel.enable_gpu, storage_root=kernel.storage_root)
        try:
            return kernel.router.preview(
                modality, mode, vram_available_gb=snapshot.gpu_vram_available_gb
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    # ------------------------------------------------------ memory (§53/§54)

    @app.post("/api/projects/{project_id}/memory", status_code=201, tags=["memory"])
    def memory_add(project_id: str, body: MemoryIn, user: dict = Depends(require_user)) -> dict:
        _can_manage(kernel, user, project_id)
        try:
            return kernel.memory.add(project_id, body.category, body.text, key=body.key, meta=body.meta)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.get("/api/projects/{project_id}/memory", tags=["memory"])
    def memory_list(
        project_id: str, category: str | None = Query(default=None), user: dict = Depends(require_user)
    ) -> dict:
        _can_manage(kernel, user, project_id)
        return {"memories": kernel.memory.list(project_id, category=category)}

    @app.post("/api/projects/{project_id}/memory/search", tags=["memory"])
    def memory_search(project_id: str, body: MemorySearchIn, user: dict = Depends(require_user)) -> dict:
        _can_manage(kernel, user, project_id)
        try:
            return {"results": kernel.memory.search(project_id, body.query, mode=body.mode, category=body.category, limit=body.limit)}
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.get("/api/search", tags=["memory"])
    def unified_search(
        project_id: str = Query(...),
        q: str = Query(min_length=1),
        mode: str = Query(default="keyword"),
        user: dict = Depends(require_user),
    ) -> dict:
        _can_manage(kernel, user, project_id)
        memory_results = kernel.memory.search(project_id, q, mode=mode, limit=10)
        needle = q.lower()
        asset_results = [
            a for a in kernel.list_assets(project_id)
            if needle in a["name"].lower() or needle in a["kind"].lower()
        ]
        return {"memory": memory_results, "assets": asset_results}

    # -------------------------------------------------- asset graph (§50/§51)

    @app.post("/api/assets/{asset_id}/relations", status_code=201, tags=["assets"])
    def relations_add(asset_id: str, body: RelationIn, user: dict = Depends(require_user)) -> dict:
        _get_owned_asset(kernel, user, asset_id)
        try:
            return kernel.graph.link(asset_id, body.to_id, body.relation)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.get("/api/assets/{asset_id}/relations", tags=["assets"])
    def relations_list(
        asset_id: str, direction: str = Query(default="both"), user: dict = Depends(require_user)
    ) -> dict:
        _get_owned_asset(kernel, user, asset_id)
        try:
            return {"relations": kernel.graph.links(asset_id, direction=direction)}
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.get("/api/assets/{asset_id}/impact", tags=["assets"])
    def asset_impact(asset_id: str, user: dict = Depends(require_user)) -> dict:
        _get_owned_asset(kernel, user, asset_id)
        return {"asset_id": asset_id, "impact": kernel.graph.impact(asset_id)}

    # ------------------------------------------------------------ styles (§14)

    @app.post("/api/projects/{project_id}/styles", status_code=201, tags=["styles"])
    def styles_add(project_id: str, body: StyleIn, user: dict = Depends(require_user)) -> dict:
        _can_manage(kernel, user, project_id)
        try:
            return kernel.styles.create(project_id, body.name, **body.model_dump(exclude={"name"}))
        except (ValueError, KeyError) as exc:
            status = 404 if isinstance(exc, KeyError) else 422
            raise HTTPException(status_code=status, detail=str(exc)) from exc

    @app.get("/api/projects/{project_id}/styles", tags=["styles"])
    def styles_list(project_id: str, user: dict = Depends(require_user)) -> dict:
        _can_manage(kernel, user, project_id)
        return {"styles": kernel.styles.list(project_id)}

    @app.get("/api/styles/{style_id}", tags=["styles"])
    def styles_get(style_id: str, user: dict = Depends(require_user)) -> dict:
        try:
            style = kernel.styles.get(style_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="style not found") from exc
        _can_manage(kernel, user, style["project_id"])
        return style

    @app.patch("/api/styles/{style_id}", tags=["styles"])
    def styles_patch(style_id: str, body: StylePatch, user: dict = Depends(require_user)) -> dict:
        try:
            style = kernel.styles.get(style_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="style not found") from exc
        _can_manage(kernel, user, style["project_id"])
        try:
            return kernel.styles.update(style_id, **body.model_dump(exclude_none=True))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    # -------------------------------------------------------- characters (§16)

    @app.post("/api/projects/{project_id}/characters", status_code=201, tags=["characters"])
    def characters_add(project_id: str, body: CharacterIn, user: dict = Depends(require_user)) -> dict:
        _can_manage(kernel, user, project_id)
        try:
            return kernel.characters.create(project_id, body.name, identity=body.identity, personality=body.personality, lore=body.lore)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.get("/api/projects/{project_id}/characters", tags=["characters"])
    def characters_list(project_id: str, user: dict = Depends(require_user)) -> dict:
        _can_manage(kernel, user, project_id)
        return {"characters": kernel.characters.list(project_id)}

    @app.get("/api/characters/{character_id}", tags=["characters"])
    def characters_get(character_id: str, user: dict = Depends(require_user)) -> dict:
        try:
            char = kernel.characters.get(character_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="character not found") from exc
        _can_manage(kernel, user, char["project_id"])
        return char

    @app.patch("/api/characters/{character_id}", tags=["characters"])
    def characters_patch(character_id: str, body: CharacterPatch, user: dict = Depends(require_user)) -> dict:
        try:
            char = kernel.characters.get(character_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="character not found") from exc
        _can_manage(kernel, user, char["project_id"])
        try:
            return kernel.characters.update(character_id, **body.model_dump(exclude_none=True))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.post("/api/characters/{character_id}/slots", tags=["characters"])
    def characters_slot(character_id: str, body: SlotIn, user: dict = Depends(require_user)) -> dict:
        try:
            char = kernel.characters.get(character_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="character not found") from exc
        _can_manage(kernel, user, char["project_id"])
        try:
            return kernel.characters.set_slot(character_id, body.slot, body.asset_id)
        except (ValueError, KeyError) as exc:
            status = 404 if isinstance(exc, KeyError) else 422
            raise HTTPException(status_code=status, detail=str(exc)) from exc

    @app.get("/api/characters/{character_id}/consistency", tags=["characters"])
    def characters_consistency(character_id: str, user: dict = Depends(require_user)) -> dict:
        try:
            char = kernel.characters.get(character_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="character not found") from exc
        _can_manage(kernel, user, char["project_id"])
        return kernel.characters.consistency(character_id)

    # ----------------------------------------------------------------- QA (§45)

    @app.post("/api/qa/run", tags=["qa"])
    def qa_run(body: QARunIn, user: dict = Depends(require_user)) -> dict:
        if body.kind not in QA_KINDS:
            raise HTTPException(status_code=422, detail=f"kind must be one of {sorted(QA_KINDS)}")
        if body.subject_kind == "asset":
            asset = _get_owned_asset(kernel, user, body.subject_id)
            try:
                data = kernel.asset_content(asset["id"])
            except KeyError as exc:
                raise HTTPException(status_code=404, detail="asset content missing") from exc
        elif body.subject_kind == "artifact":
            try:
                data = kernel.artifact_content(body.subject_id)
            except KeyError as exc:
                raise HTTPException(status_code=404, detail="artifact not found") from exc
        else:
            raise HTTPException(status_code=422, detail="subject_kind must be asset or artifact")
        try:
            return kernel.qa.record(
                body.kind, data, subject_kind=body.subject_kind, subject_id=body.subject_id, params=body.params
            )
        except Exception as exc:  # QAUnavailable etc. — honest failure
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.get("/api/qa/reports", tags=["qa"])
    def qa_reports(
        job_id: str | None = Query(default=None),
        subject_id: str | None = Query(default=None),
        _user: dict = Depends(require_user),
    ) -> dict:
        return {"reports": kernel.qa.list_reports(job_id=job_id, subject_id=subject_id)}

    # ------------------------------------------------------------- providers (§55)

    @app.get("/api/providers", tags=["providers"])
    def providers_list(_user: dict = Depends(require_user)) -> dict:
        return {"providers": kernel.providers.list()}

    @app.post("/api/providers", status_code=201, tags=["providers"])
    def providers_add(body: ProviderIn, _admin: dict = Depends(require_admin)) -> dict:
        try:
            return kernel.providers.add(
                body.name, kind=body.kind, base_url=body.base_url, keys=body.keys,
                priority=body.priority, quota_total=body.quota_total,
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.post("/api/providers/{name}/health", tags=["providers"])
    def providers_health(name: str, _admin: dict = Depends(require_admin)) -> dict:
        try:
            return kernel.providers.health(name)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="provider not found") from exc

    @app.post("/api/providers/pick", tags=["providers"])
    def providers_pick(_user: dict = Depends(require_user)) -> dict:
        try:
            return kernel.providers.pick()
        except Exception as exc:  # ProviderUnavailable
            raise HTTPException(status_code=409, detail=str(exc)) from exc
