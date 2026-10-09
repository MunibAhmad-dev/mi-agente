"""HTTP surface for the kernel (consumed by the React dashboard and CLI).

Endpoints are thin: they read/write through the Kernel, never touching models or
storage directly. A background scheduler thread (started on lifespan) advances
jobs, so POST /api/jobs returns immediately and clients poll GET /api/jobs/{id}.

Security (Master Prompt §64): registration/login with PBKDF2 password hashing,
HMAC-signed bearer tokens, ADMIN/USER roles. Everything under /api requires a
valid token except /api/auth/register and /api/auth/login. /health is public.
"""

from __future__ import annotations

import mimetypes
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field

from engine import __version__
from engine.kernel.errors import UCEError
from engine.kernel.kernel import Kernel
from engine.kernel.security import decode_token, sign_token, verify_password
from engine.kernel.taskgraph import GraphError
from engine.logging_conf import get_logger
from engine.resources import QuotaExceeded
from engine.kernel.security import RateLimiter

logger = get_logger("api")


# --------------------------------------------------------------------- models


class TaskIn(BaseModel):
    model_config = ConfigDict(extra="forbid")  # unknown fields fail loudly, never silently dropped

    id: str
    kind: str
    params: dict[str, Any] = Field(default_factory=dict)
    qa_policy: dict[str, Any] | None = None


class EdgeIn(BaseModel):
    task: str
    depends_on: str


class JobCreate(BaseModel):
    name: str
    tasks: list[TaskIn]
    edges: list[EdgeIn] = Field(default_factory=list)
    priority: int = 0
    project_id: str | None = None


class AuthRegister(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=8, max_length=256)


class AuthLogin(BaseModel):
    username: str
    password: str


class AdminUserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=8, max_length=256)
    role: str = "USER"


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""


class ProjectPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None


class RollbackIn(BaseModel):
    version: int = Field(ge=1)


# ------------------------------------------------------------------- security


def _bearer_user(request: Request) -> dict:
    kernel: Kernel = request.app.state.kernel
    secret: str = request.app.state.secret
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    token = auth.split(" ", 1)[1].strip()
    payload = decode_token(token, secret)
    if payload is None:
        raise HTTPException(status_code=401, detail="invalid or expired token")
    try:
        return kernel.get_user(payload["sub"])
    except KeyError as exc:
        raise HTTPException(status_code=401, detail="unknown user") from exc


def require_user(request: Request) -> dict:
    return _bearer_user(request)


def require_admin(user: dict = Depends(require_user)) -> dict:
    if user["role"] != "ADMIN":
        raise HTTPException(status_code=403, detail="admin role required")
    return user


def _can_manage(kernel: Kernel, user: dict, project_id: str) -> dict:
    try:
        project = kernel.get_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="project not found") from exc
    if user["role"] != "ADMIN" and project["owner_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="not your project")
    return project


# ----------------------------------------------------------------------- app


def create_app(kernel: Kernel, poll_interval: float = 0.2, secret: str = "") -> FastAPI:
    stop = threading.Event()
    thread: threading.Thread | None = None
    login_limiter = RateLimiter(max_events=10, window_seconds=60.0)  # per IP+username
    register_limiter = RateLimiter(max_events=5, window_seconds=60.0)  # per IP

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        nonlocal thread

        def loop() -> None:
            while not stop.is_set():
                try:
                    kernel.tick()
                except Exception as exc:  # noqa: BLE001 - poll loop must survive
                    logger.exception("scheduler tick error", exc_info=exc)
                stop.wait(poll_interval)

        thread = threading.Thread(target=loop, daemon=True, name="uce-scheduler")
        thread.start()
        yield
        stop.set()
        if thread is not None:
            thread.join(timeout=5)

    app = FastAPI(title="Universal Creative Engine — Kernel", version=__version__, lifespan=lifespan)
    app.state.kernel = kernel
    app.state.secret = secret

    # ---------------------------------------------------------- error handlers

    @app.exception_handler(GraphError)
    async def graph_error_handler(_request: Request, exc: GraphError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={"error": {"code": "INVALID_GRAPH", "message": str(exc)}},
        )

    @app.exception_handler(UCEError)
    async def uce_error_handler(_request: Request, exc: UCEError) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                    "suggested_fix": exc.suggested_fix,
                }
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_error_handler(_request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled API error", exc_info=exc)
        return JSONResponse(status_code=500, content={"error": {"code": "INTERNAL", "message": "internal server error"}})

    # ------------------------------------------------------------------- health

    @app.get("/health")
    def health() -> dict:
        from sqlalchemy import text

        db_ok = True
        try:
            with kernel.Session() as s:
                s.execute(text("SELECT 1"))
        except Exception:  # noqa: BLE001
            db_ok = False
        return {
            "status": "ok" if db_ok else "degraded",
            "version": __version__,
            "db": kernel.db_url,
            "storage": kernel.storage_root,
            "gpu": False,  # CPU-only by user decision (2026-09-07)
            "jobs": kernel.job_status_counts(),
        }

    # -------------------------------------------------------------------- auth

    def _client_ip(request: Request) -> str:
        return request.client.host if request.client else "unknown"

    @app.post("/api/auth/register", tags=["auth"])
    def register(body: AuthRegister, request: Request) -> dict:
        ip = _client_ip(request)
        if not register_limiter.check(ip):
            raise HTTPException(status_code=429, detail="too many registrations; slow down",
                                headers={"Retry-After": str(register_limiter.retry_after(ip))})
        try:
            user = kernel.create_user(body.username, body.password)
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        return user

    @app.post("/api/auth/login", tags=["auth"])
    def login(body: AuthLogin, request: Request) -> dict:
        key = f"{_client_ip(request)}:{body.username}"
        if not login_limiter.check(key):
            raise HTTPException(status_code=429, detail="too many login attempts; slow down",
                                headers={"Retry-After": str(login_limiter.retry_after(key))})
        user = kernel.get_user_by_username(body.username)
        if user is None or not verify_password(body.password, _password_hash(kernel, user["id"])):
            raise HTTPException(status_code=401, detail="invalid username or password")
        token = sign_token({"sub": user["id"], "role": user["role"]}, app.state.secret)
        return {"token": token, "user": user}

    @app.get("/api/auth/me", tags=["auth"])
    def me(user: dict = Depends(require_user)) -> dict:
        return user

    # ------------------------------------------------------------------ admin

    @app.get("/api/admin/users", tags=["admin"])
    def admin_list_users(_user: dict = Depends(require_admin)) -> dict:
        return {"users": kernel.list_users()}

    @app.post("/api/admin/users", status_code=201, tags=["admin"])
    def admin_create_user(body: AdminUserCreate, _user: dict = Depends(require_admin)) -> dict:
        try:
            return kernel.create_user(body.username, body.password, role=body.role)
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    # ---------------------------------------------------------------- projects

    @app.post("/api/projects", status_code=201, tags=["projects"])
    def create_project(body: ProjectCreate, user: dict = Depends(require_user)) -> dict:
        try:
            return kernel.create_project(body.name, owner_id=user["id"], description=body.description)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.get("/api/projects", tags=["projects"])
    def list_projects(user: dict = Depends(require_user)) -> dict:
        owner_id = None if user["role"] == "ADMIN" else user["id"]
        return {"projects": kernel.list_projects(owner_id=owner_id)}

    @app.get("/api/projects/{project_id}", tags=["projects"])
    def get_project(project_id: str, user: dict = Depends(require_user)) -> dict:
        _can_manage(kernel, user, project_id)
        return kernel.get_project(project_id)

    @app.patch("/api/projects/{project_id}", tags=["projects"])
    def patch_project(project_id: str, body: ProjectPatch, user: dict = Depends(require_user)) -> dict:
        _can_manage(kernel, user, project_id)
        try:
            return kernel.update_project(project_id, name=body.name, description=body.description)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.post("/api/projects/{project_id}/archive", tags=["projects"])
    def archive_project(project_id: str, user: dict = Depends(require_user)) -> dict:
        _can_manage(kernel, user, project_id)
        return kernel.archive_project(project_id)

    # ------------------------------------------------------------------ assets

    @app.post("/api/projects/{project_id}/assets", status_code=201, tags=["assets"])
    async def upload_asset(
        project_id: str,
        request: Request,
        name: str = Query(min_length=1),
        kind: str = "file",
        note: str = "",
        user: dict = Depends(require_user),
    ) -> dict:
        _can_manage(kernel, user, project_id)
        data = await request.body()
        if len(data) > 512 * 1024 * 1024:  # 512 MiB upload cap
            raise HTTPException(status_code=413, detail="payload too large")
        try:
            return kernel.create_asset(project_id, name=name, kind=kind, data=data, note=note)
        except QuotaExceeded as exc:
            raise HTTPException(status_code=413, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.get("/api/projects/{project_id}/assets", tags=["assets"])
    def list_assets(project_id: str, user: dict = Depends(require_user)) -> dict:
        _can_manage(kernel, user, project_id)
        return {"assets": kernel.list_assets(project_id)}

    @app.get("/api/assets/{asset_id}", tags=["assets"])
    def get_asset(asset_id: str, user: dict = Depends(require_user)) -> dict:
        asset = _get_owned_asset(kernel, user, asset_id)
        return asset

    @app.get("/api/assets/{asset_id}/versions", tags=["assets"])
    def asset_versions(asset_id: str, user: dict = Depends(require_user)) -> dict:
        _get_owned_asset(kernel, user, asset_id)
        return {"versions": kernel.asset_versions(asset_id)}

    @app.post("/api/assets/{asset_id}/versions", status_code=201, tags=["assets"])
    async def add_version(
        asset_id: str,
        request: Request,
        note: str = "",
        user: dict = Depends(require_user),
    ) -> dict:
        _get_owned_asset(kernel, user, asset_id)
        data = await request.body()
        try:
            return kernel.add_asset_version(asset_id, data, note=note)
        except QuotaExceeded as exc:
            raise HTTPException(status_code=413, detail=str(exc)) from exc

    @app.post("/api/assets/{asset_id}/rollback", tags=["assets"])
    def rollback(asset_id: str, body: RollbackIn, user: dict = Depends(require_user)) -> dict:
        _get_owned_asset(kernel, user, asset_id)
        try:
            return kernel.rollback_asset(asset_id, body.version)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.get("/api/assets/{asset_id}/content", tags=["assets"])
    def asset_content(asset_id: str, user: dict = Depends(require_user)) -> Response:
        _get_owned_asset(kernel, user, asset_id)
        try:
            data = kernel.asset_content(asset_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="asset content not found") from exc
        return Response(
            content=data,
            media_type="application/octet-stream",
            headers={"X-Content-Sha256": kernel.get_asset(asset_id)["sha256"]},
        )

    # -------------------------------------------------------------------- jobs

    @app.post("/api/jobs", status_code=201, tags=["jobs"])
    def create_job(body: JobCreate, user: dict = Depends(require_user)) -> dict:
        project_id = body.project_id
        if project_id is not None:
            _can_manage(kernel, user, project_id)
        job_id = kernel.submit_graph(
            name=body.name,
            tasks=[t.model_dump(exclude_none=True) for t in body.tasks],
            edges=[e.model_dump() for e in body.edges],
            priority=body.priority,
            project_id=project_id,
        )
        return {"id": job_id}

    @app.get("/api/jobs", tags=["jobs"])
    def list_jobs(
        status: str | None = Query(default=None),
        project_id: str | None = Query(default=None),
        _user: dict = Depends(require_user),
    ) -> dict:
        return {"jobs": kernel.list_jobs(status=status, project_id=project_id)}

    @app.get("/api/jobs/{job_id}", tags=["jobs"])
    def get_job(job_id: str, _user: dict = Depends(require_user)) -> dict:
        try:
            return kernel.get_job(job_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="job not found") from exc

    @app.post("/api/jobs/{job_id}/resume", tags=["jobs"])
    def resume_job(job_id: str, _user: dict = Depends(require_user)) -> dict:
        try:
            kernel.resume_job(job_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="job not found") from exc
        return {"id": job_id, "status": "QUEUED"}

    @app.post("/api/jobs/{job_id}/cancel", tags=["jobs"])
    def cancel_job(job_id: str, _user: dict = Depends(require_user)) -> dict:
        try:
            kernel.cancel_job(job_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="job not found") from exc
        return {"id": job_id, "status": "CANCELLED"}

    @app.get("/api/tasks/{task_id}", tags=["jobs"])
    def get_task(task_id: str, _user: dict = Depends(require_user)) -> dict:
        try:
            return kernel.get_task(task_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="task not found") from exc

    @app.get("/api/artifacts", tags=["jobs"])
    def list_artifacts(
        job_id: str | None = Query(default=None),
        _user: dict = Depends(require_user),
    ) -> dict:
        return {"artifacts": kernel.list_artifacts(job_id=job_id)}

    @app.get("/api/artifacts/{artifact_id}/content", tags=["jobs"])
    def artifact_content(artifact_id: str, _user: dict = Depends(require_user)) -> Response:
        try:
            data = kernel.artifact_content(artifact_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="artifact not found") from exc
        return Response(
            content=data,
            media_type="application/octet-stream",
            headers={"X-Content-Sha256": kernel.artifact_sha(artifact_id)},
        )

    @app.get("/api/errors", tags=["observability"])
    def list_errors(
        job_id: str | None = Query(default=None),
        _user: dict = Depends(require_user),
    ) -> dict:
        return {"errors": kernel.list_errors(job_id=job_id)}

    @app.get("/api/telemetry", tags=["observability"])
    def list_telemetry(
        job_id: str | None = Query(default=None),
        _user: dict = Depends(require_user),
    ) -> dict:
        return {"telemetry": kernel.list_telemetry(job_id=job_id)}

    @app.post("/api/system/recover", tags=["system"])
    def recover(_user: dict = Depends(require_user)) -> dict:
        return {"recovered": kernel.recover_stale()}

    # ------------------------------------------- domain modules (extended API)

    from engine.kernel.api_ext import register_ext  # deferred: avoids import cycle

    register_ext(app)

    # ------------------------------------------------------- dashboard (SPA)

    dist = Path(__file__).resolve().parents[2] / "dashboard" / "dist"
    if dist.is_dir():

        @app.get("/{full_path:path}", include_in_schema=False)
        def spa(full_path: str) -> Response:
            if full_path.split("/")[0] in ("api", "health", "docs", "openapi.json"):
                raise HTTPException(status_code=404, detail="not found")
            index = dist / "index.html"
            if full_path:
                target = (dist / full_path).resolve()
                if target.is_file() and target.parent == dist.resolve() or dist.resolve() in target.parents:
                    media = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
                    return Response(target.read_bytes(), media_type=media)
            return Response(index.read_bytes(), media_type="text/html")

    return app


# ------------------------------------------------------------------- helpers


def _get_owned_asset(kernel: Kernel, user: dict, asset_id: str) -> dict:
    try:
        asset = kernel.get_asset(asset_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="asset not found") from exc
    _can_manage(kernel, user, asset["project_id"])
    return asset


def _password_hash(kernel: Kernel, user_id: str) -> str:
    """Fetch a user's stored password hash for verification."""
    from sqlalchemy import select

    from engine.kernel.models import User

    with kernel.Session() as s:
        user = s.get(User, user_id)
        return user.password_hash if user else ""