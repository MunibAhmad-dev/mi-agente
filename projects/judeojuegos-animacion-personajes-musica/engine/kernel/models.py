"""ORM schema for the kernel database.

Core execution: Job, Task, TaskEdge, Artifact, Checkpoint, ErrorRecord, TelemetryRow.
Job states (Master Prompt §60): QUEUED → PLANNED → WAITING → RUNNING → QA →
REPAIR → COMPLETED / FAILED / CANCELLED. M0/M1 exercise QUEUED/RUNNING/COMPLETED/
FAILED/CANCELLED; QA and REPAIR enter with the QA phase.
M1 entities: User (auth/RBAC), Project (workspace), Asset + AssetVersion
(content-addressed store with version history and rollback, Master Prompt §62).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.dialects.sqlite import JSON as SqliteJSON
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import JSON as GenericJSON


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, default="QUEUED", index=True)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    project_id: Mapped[str | None] = mapped_column(ForeignKey("projects.id"), nullable=True, index=True)
    error_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    tasks: Mapped[list["Task"]] = relationship(back_populates="job")


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(Text, primary_key=True)  # internal, job-scoped: "<job_id>_<name>"
    name: Mapped[str] = mapped_column(Text, default="")  # user-facing task label, unique within a job
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id"), index=True)
    kind: Mapped[str] = mapped_column(Text)
    params: Mapped[dict[str, Any]] = mapped_column(SqliteJSON().with_variant(GenericJSON, "postgresql"), default=dict)
    # QA policy (Master Prompt §45–49): when set, the kernel runs these checks on the
    # task's artifacts after a successful run and drives the REPAIR loop on failure.
    # Shape: {"kind": "text"|"image"|..., "params": {...}}
    qa_policy: Mapped[dict[str, Any] | None] = mapped_column(
        SqliteJSON().with_variant(GenericJSON, "postgresql"), nullable=True
    )
    manifest_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(Text, default="PENDING", index=True)  # PENDING/RUNNING/COMPLETED/FAILED/CANCELLED
    attempt: Mapped[int] = mapped_column(Integer, default=0)
    pid: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    job: Mapped[Job] = relationship(back_populates="tasks")
    artifacts: Mapped[list["Artifact"]] = relationship(back_populates="task")


class TaskEdge(Base):
    """Directed edge: task_id depends on depends_on."""

    __tablename__ = "task_edges"

    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), primary_key=True)
    depends_on: Mapped[str] = mapped_column(ForeignKey("tasks.id"), primary_key=True)


class Artifact(Base):
    __tablename__ = "artifacts"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=_uuid)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id"), index=True)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), index=True)
    name: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(Text)
    sha256: Mapped[str] = mapped_column(Text, index=True)
    size: Mapped[int] = mapped_column(Integer)
    rel_path: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    task: Mapped[Task] = relationship(back_populates="artifacts")


class Checkpoint(Base):
    """One row per completed task: the reproducible receipt (Master Prompt §52/§61)."""

    __tablename__ = "checkpoints"

    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), primary_key=True)
    manifest_hash: Mapped[str] = mapped_column(Text)
    artifact_hashes: Mapped[list[str]] = mapped_column(SqliteJSON().with_variant(GenericJSON, "postgresql"), default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=_uuid)
    username: Mapped[str] = mapped_column(Text, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(Text, default="USER")  # ADMIN / USER
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class Project(Base):
    """A creative project (Master Prompt §1: the container that ties everything together)."""

    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(Text)
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(Text, default="ACTIVE", index=True)  # ACTIVE / ARCHIVED
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    owner: Mapped[User] = relationship()


class Asset(Base):
    """A named asset inside a project. Content lives in the content-addressed store;
    this table holds the pointer (current_sha256) and version number."""

    __tablename__ = "assets"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    name: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(Text, default="file")
    current_sha256: Mapped[str] = mapped_column(Text)
    size: Mapped[int] = mapped_column(Integer)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    project: Mapped[Project] = relationship()
    versions: Mapped[list["AssetVersion"]] = relationship(back_populates="asset")


class AssetVersion(Base):
    """Immutable version history for an asset; rollback repoints the asset pointer."""

    __tablename__ = "asset_versions"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=_uuid)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(Text)
    size: Mapped[int] = mapped_column(Integer)
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    asset: Mapped[Asset] = relationship(back_populates="versions")


class ErrorRecord(Base):
    __tablename__ = "errors"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=_uuid)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id"), index=True)
    task_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    code: Mapped[str] = mapped_column(Text)
    message: Mapped[str] = mapped_column(Text)
    cause: Mapped[str | None] = mapped_column(Text, nullable=True)
    task_kind: Mapped[str | None] = mapped_column(Text, nullable=True)
    resource: Mapped[str | None] = mapped_column(Text, nullable=True)
    stack: Mapped[str | None] = mapped_column(Text, nullable=True)
    suggested_fix: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(Text, default="OPEN")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class LicenseEntry(Base):
    """Licensing firewall record (Master Prompt §4). Open source is never assumed free."""

    __tablename__ = "licenses"

    name: Mapped[str] = mapped_column(Text, primary_key=True)
    version: Mapped[str] = mapped_column(Text, default="")
    code_license: Mapped[str] = mapped_column(Text, default="")
    weights_license: Mapped[str] = mapped_column(Text, default="")
    dataset_license: Mapped[str] = mapped_column(Text, default="")
    commercial_use: Mapped[bool] = mapped_column(Boolean, default=False)
    redistribution: Mapped[bool] = mapped_column(Boolean, default=False)
    modification: Mapped[bool] = mapped_column(Boolean, default=False)
    restrictions: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(Text, default="")
    checked_date: Mapped[str] = mapped_column(Text, default="")
    verdict: Mapped[str] = mapped_column(Text, default="UNKNOWN")  # APPROVED/RESTRICTED/BLOCKED/UNKNOWN
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class ModelRecord(Base):
    """Model registry entry (Master Prompt §10): capability-based routing input."""

    __tablename__ = "models"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(Text, unique=True, index=True)
    version: Mapped[str] = mapped_column(Text, default="")
    modality: Mapped[str] = mapped_column(Text, index=True)  # llm/image/video/audio/music/embedding/3d
    capabilities: Mapped[list[str]] = mapped_column(SqliteJSON().with_variant(GenericJSON, "postgresql"), default=list)
    quality: Mapped[float] = mapped_column(Float, default=0.0)  # 0..1
    speed: Mapped[float] = mapped_column(Float, default=0.0)  # 0..1
    vram_gb: Mapped[float] = mapped_column(Float, default=0.0)
    ram_gb: Mapped[float] = mapped_column(Float, default=0.0)
    cpu_ok: Mapped[bool] = mapped_column(Boolean, default=True)
    context: Mapped[int] = mapped_column(Integer, default=0)
    license_name: Mapped[str] = mapped_column(Text, default="")  # FK-by-name into licenses
    quantization: Mapped[str] = mapped_column(Text, default="")
    strengths: Mapped[list[str]] = mapped_column(SqliteJSON().with_variant(GenericJSON, "postgresql"), default=list)
    weaknesses: Mapped[list[str]] = mapped_column(SqliteJSON().with_variant(GenericJSON, "postgresql"), default=list)
    adapter: Mapped[str] = mapped_column(Text, default="")
    availability: Mapped[str] = mapped_column(Text, default="unavailable")  # available/unavailable
    availability_detail: Mapped[str] = mapped_column(Text, default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class MemoryEntry(Base):
    """Project memory (Master Prompt §53). Categories are fixed and validated."""

    __tablename__ = "memories"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    category: Mapped[str] = mapped_column(Text, index=True)
    key: Mapped[str] = mapped_column(Text, default="")
    text: Mapped[str] = mapped_column(Text)
    meta: Mapped[dict[str, Any]] = mapped_column(SqliteJSON().with_variant(GenericJSON, "postgresql"), default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class AssetRelation(Base):
    """Typed edge in the asset graph (Master Prompt §50)."""

    __tablename__ = "asset_relations"
    __table_args__ = (UniqueConstraint("from_id", "to_id", "relation", name="uq_asset_relation"),)

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=_uuid)
    from_id: Mapped[str] = mapped_column(ForeignKey("assets.id"), index=True)
    to_id: Mapped[str] = mapped_column(ForeignKey("assets.id"), index=True)
    relation: Mapped[str] = mapped_column(Text)  # derived_from/references/depends_on/variant_of
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class StyleProfile(Base):
    """Persistent style entity (Master Prompt §14) — no LoRA dependency."""

    __tablename__ = "styles"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    name: Mapped[str] = mapped_column(Text)
    description: Mapped[str] = mapped_column(Text, default="")
    palette: Mapped[list[str]] = mapped_column(SqliteJSON().with_variant(GenericJSON, "postgresql"), default=list)
    lighting: Mapped[str] = mapped_column(Text, default="")
    line_style: Mapped[str] = mapped_column(Text, default="")
    materials: Mapped[str] = mapped_column(Text, default="")
    composition: Mapped[str] = mapped_column(Text, default="")
    texture: Mapped[str] = mapped_column(Text, default="")
    character_treatment: Mapped[str] = mapped_column(Text, default="")
    environment_treatment: Mapped[str] = mapped_column(Text, default="")
    ref_asset_ids: Mapped[list[str]] = mapped_column(SqliteJSON().with_variant(GenericJSON, "postgresql"), default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class Character(Base):
    """Persistent character (Master Prompt §16) — slots map to asset ids."""

    __tablename__ = "characters"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    name: Mapped[str] = mapped_column(Text)
    identity: Mapped[dict[str, Any]] = mapped_column(SqliteJSON().with_variant(GenericJSON, "postgresql"), default=dict)
    personality: Mapped[str] = mapped_column(Text, default="")
    lore: Mapped[str] = mapped_column(Text, default="")
    slots: Mapped[dict[str, Any]] = mapped_column(SqliteJSON().with_variant(GenericJSON, "postgresql"), default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class QAReport(Base):
    """Result of a QA run (Master Prompt §45–49), stored for audit and repair."""

    __tablename__ = "qa_reports"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=_uuid)
    job_id: Mapped[str | None] = mapped_column(Text, nullable=True, index=True)
    task_id: Mapped[str | None] = mapped_column(Text, nullable=True, index=True)
    subject_kind: Mapped[str] = mapped_column(Text)  # artifact/asset
    subject_id: Mapped[str] = mapped_column(Text, index=True)
    kind: Mapped[str] = mapped_column(Text)  # text/image/audio/model3d/video
    passed: Mapped[bool] = mapped_column(Boolean)
    score: Mapped[float] = mapped_column(Float, default=0.0)  # 0..1
    checks: Mapped[list[dict[str, Any]]] = mapped_column(
        SqliteJSON().with_variant(GenericJSON, "postgresql"), default=list
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class ProviderRecord(Base):
    """Remote provider (Master Prompt §55): keys, rotation, health, quota, priority."""

    __tablename__ = "providers"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(Text, unique=True, index=True)
    kind: Mapped[str] = mapped_column(Text, default="openai_compat")
    base_url: Mapped[str] = mapped_column(Text, default="")
    keys: Mapped[list[str]] = mapped_column(SqliteJSON().with_variant(GenericJSON, "postgresql"), default=list)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    quota_total: Mapped[int] = mapped_column(Integer, default=0)  # 0 = unlimited
    quota_used: Mapped[int] = mapped_column(Integer, default=0)
    healthy: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    last_check: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class RepairAttempt(Base):
    """One automatic repair cycle (Master Prompt §49): QA fail -> requeue with context."""

    __tablename__ = "repair_attempts"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=_uuid)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id"), index=True)
    task_id: Mapped[str] = mapped_column(Text, index=True)
    attempt: Mapped[int] = mapped_column(Integer)
    diagnosis: Mapped[str] = mapped_column(Text, default="")
    action: Mapped[str] = mapped_column(Text, default="requeue")
    qa_report_ids: Mapped[list[str]] = mapped_column(
        SqliteJSON().with_variant(GenericJSON, "postgresql"), default=list
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class EventRecord(Base):
    """Persisted kernel event (audit item: events must survive restarts)."""

    __tablename__ = "events"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=_uuid)
    topic: Mapped[str] = mapped_column(Text, index=True)
    job_id: Mapped[str | None] = mapped_column(Text, nullable=True, index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(SqliteJSON().with_variant(GenericJSON, "postgresql"), default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)


class TelemetryRow(Base):
    __tablename__ = "telemetry"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=_uuid)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id"), index=True)
    task_id: Mapped[str] = mapped_column(Text)
    model: Mapped[str | None] = mapped_column(Text, nullable=True)
    resource: Mapped[str] = mapped_column(Text, default="cpu")
    time_ms: Mapped[float] = mapped_column()
    ram_mb: Mapped[int | None] = mapped_column(Integer, nullable=True)
    vram_mb: Mapped[int | None] = mapped_column(Integer, nullable=True)
    result: Mapped[str] = mapped_column(Text)
    error_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)