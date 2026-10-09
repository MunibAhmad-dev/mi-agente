"""Worker subprocess entrypoint.

Runs one task in a separate OS process, coordinated by the kernel (Master Prompt
§0: heavy/risky work runs in isolated workers). Usage:
    python -m engine.kernel.worker <task_id>
with UCE_DB_URL and UCE_STORAGE_ROOT in the environment.

The worker claims the task (PENDING → RUNNING), executes its handler, persists
artifacts + checkpoint, and records telemetry. On failure it records a
structured error (Master Prompt §71) and marks the task FAILED.
"""

from __future__ import annotations

import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select

from engine.kernel.db import create_db_engine, session_factory
from engine.kernel.errors import UCEError, record_error
from engine.kernel.handlers import HANDLERS, ArtifactOut, HandlerContext
from engine.kernel.models import Artifact, Checkpoint, Job, Task, TaskEdge
from engine.kernel.storage import AssetStore
from engine.kernel.telemetry import record_telemetry


def _load_inputs(session, store: AssetStore, task_id: str) -> list[tuple[str, list[ArtifactOut]]]:
    edges = session.scalars(select(TaskEdge).where(TaskEdge.task_id == task_id).order_by(TaskEdge.depends_on)).all()
    inputs: list[tuple[str, list[ArtifactOut]]] = []
    for edge in edges:
        artifacts = session.scalars(
            select(Artifact).where(Artifact.task_id == edge.depends_on).order_by(Artifact.name)
        ).all()
        items = [ArtifactOut(name=a.name, kind=a.kind, data=store.read_bytes(a.sha256)) for a in artifacts]
        inputs.append((edge.depends_on, items))
    return inputs


def run_task(task_id: str, db_url: str, storage_root: Path) -> int:
    engine = create_db_engine(db_url)
    Session = session_factory(engine)
    store = AssetStore(storage_root)
    start = time.perf_counter()

    with Session() as session:
        task = session.get(Task, task_id)
        if task is None or task.status != "PENDING":
            return 0  # already handled — idempotent claim

        job = session.get(Job, task.job_id)
        task.status = "RUNNING"
        task.attempt = (task.attempt or 0) + 1
        task.pid = os.getpid()
        if job.status in ("QUEUED", "PLANNED"):
            job.status = "RUNNING"
        # A fresh attempt supersedes previous outputs (retry/repair/crash-resume):
        # stale artifacts would be double-counted by QA and manifest checks.
        for old in session.scalars(select(Artifact).where(Artifact.task_id == task_id)).all():
            session.delete(old)
        session.commit()

        try:
            inputs = _load_inputs(session, store, task_id)
            workdir = storage_root / "jobs" / task.job_id / "work" / task_id
            workdir.mkdir(parents=True, exist_ok=True)
            ctx = HandlerContext(task_id=task_id, job_id=task.job_id, workdir=workdir, store=store)
            handler = HANDLERS.get(task.kind)
            if handler is None:
                raise UCEError(
                    f"unknown task kind: {task.kind}",
                    code="UNKNOWN_TASK_KIND",
                    task_kind=task.kind,
                    suggested_fix="register a handler for this kind or fix the task kind",
                )
            artifacts = handler(task.params or {}, ctx, inputs)

            hashes: list[str] = []
            for artifact in artifacts:
                sha = store.put_bytes(artifact.data)
                session.add(
                    Artifact(
                        job_id=task.job_id,
                        task_id=task_id,
                        name=artifact.name,
                        kind=artifact.kind,
                        sha256=sha,
                        size=len(artifact.data),
                        rel_path=f"blobs/{sha}",
                    )
                )
                hashes.append(sha)

            checkpoint = session.get(Checkpoint, task_id)
            if checkpoint is None:
                session.add(
                    Checkpoint(task_id=task_id, manifest_hash=task.manifest_hash or "", artifact_hashes=hashes)
                )
            else:
                checkpoint.manifest_hash = task.manifest_hash or checkpoint.manifest_hash
                checkpoint.artifact_hashes = hashes

            task.status = "COMPLETED"
            task.completed_at = datetime.now(timezone.utc)
            session.commit()
            record_telemetry(
                session,
                job_id=task.job_id,
                task_id=task_id,
                time_ms=(time.perf_counter() - start) * 1000,
                result="COMPLETED",
            )
            session.commit()
            return 0

        except UCEError as exc:
            record = record_error(session, job_id=task.job_id, task_id=task_id, exc=exc, task_kind=task.kind)
            task.status = "FAILED"
            task.error_id = record.id
            session.commit()
            record_telemetry(
                session,
                job_id=task.job_id,
                task_id=task_id,
                time_ms=(time.perf_counter() - start) * 1000,
                result="FAILED",
                error_id=record.id,
            )
            session.commit()
            return 1
        except Exception as exc:  # noqa: BLE001 - worker must never crash without a record
            record = record_error(session, job_id=task.job_id, task_id=task_id, exc=exc, task_kind=task.kind)
            task.status = "FAILED"
            task.error_id = record.id
            session.commit()
            record_telemetry(
                session,
                job_id=task.job_id,
                task_id=task_id,
                time_ms=(time.perf_counter() - start) * 1000,
                result="FAILED",
                error_id=record.id,
            )
            session.commit()
            return 1


def main() -> None:
    if len(sys.argv) != 2:
        print("usage: python -m engine.kernel.worker <task_id>", file=sys.stderr)
        sys.exit(2)
    db_url = os.environ["UCE_DB_URL"]
    storage_root = Path(os.environ["UCE_STORAGE_ROOT"])
    sys.exit(run_task(sys.argv[1], db_url, storage_root))


if __name__ == "__main__":
    main()