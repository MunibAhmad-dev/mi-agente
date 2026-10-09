"""The Kernel — the monolith's single source of truth (Master Prompt §7).

One restartable process, one database. The kernel owns orchestration and state;
heavy work runs in worker subprocesses coordinated here. M0 scheduling is
sequential (one task at a time per poll tick); the resource manager widens this
in later phases.
"""

from __future__ import annotations

import os
import subprocess
import sys
import time
import uuid
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from engine.kernel.db import create_db_engine, session_factory
from engine.kernel.errors import UCEError, record_error
from engine.kernel.events import EventBus, db_sink_factory
from engine.kernel.models import (
    Artifact,
    Asset,
    AssetVersion,
    Base,
    ErrorRecord,
    Job,
    Project,
    RepairAttempt,
    Task,
    TaskEdge,
    TelemetryRow,
    User,
)
from engine.kernel.security import hash_password
from engine.kernel.storage import AssetStore
from engine.kernel.taskgraph import EdgeSpec, GraphError, TaskGraph, TaskSpec, manifest_hash
from engine.kernel.telemetry import record_telemetry
from engine.logging_conf import get_logger
from engine.assets.graph import AssetGraph
from engine.characters import CharacterService
from engine.licenses import LicenseFirewall
from engine.memory import MemoryStore
from engine.models import ModelRegistry, ModelRouter
from engine.providers import ProviderManager
from engine.qa import KINDS as QA_KINDS
from engine.qa import QAEngine, QAUnavailable
from engine.resources import QuotaExceeded
from engine.styles import StyleService

logger = get_logger("kernel")

ACTIVE_JOB_STATUSES = ("QUEUED", "PLANNED", "RUNNING", "WAITING", "QA", "REPAIR")
TERMINAL_STATUSES = ("COMPLETED", "FAILED", "CANCELLED")


def _pid_alive(pid: int) -> bool:
    """Windows-safe liveness probe (no signals on Win32)."""
    if pid <= 0:
        return False
    try:
        if os.name == "nt":
            import ctypes

            handle = ctypes.windll.kernel32.OpenProcess(ctypes.c_ulong(0x1000), False, ctypes.c_ulong(pid))  # PROCESS_QUERY_LIMITED_INFORMATION
            if handle:
                ctypes.windll.kernel32.CloseHandle(handle)
                return True
            return False
        os.kill(pid, 0)
        return True
    except (OSError, ProcessLookupError):
        return False


class Kernel:
    def __init__(
        self,
        db_url: str,
        storage_root: Path | str,
        max_attempts: int = 2,
        *,
        enable_gpu: bool = False,
        project_quota_bytes: int = 0,
        task_timeout_s: float = 600.0,
        max_parallel: int = 2,
        secret: str = "",
    ) -> None:
        self.db_url = db_url
        self.storage_root = str(Path(storage_root))
        self.max_attempts = max_attempts
        self.enable_gpu = enable_gpu
        self.project_quota_bytes = project_quota_bytes
        self.task_timeout_s = task_timeout_s
        self.max_parallel = max(1, max_parallel)
        self.secret = secret
        self._executor: ThreadPoolExecutor | None = None
        self._lock_path: Path | None = None
        if db_url.startswith("sqlite:///"):
            Path(db_url[len("sqlite:///") :]).parent.mkdir(parents=True, exist_ok=True)
        self.engine = create_db_engine(db_url)
        self.Session = session_factory(self.engine)
        Base.metadata.create_all(self.engine)
        self._ensure_schema()
        self.store = AssetStore(Path(self.storage_root))
        self.events = EventBus(sink=db_sink_factory(self.Session))
        self._repo_root = Path(__file__).resolve().parents[2]

        # Domain services — the monolith's wiring table (one process, one DB).
        self.memory = MemoryStore(self.Session)
        self.graph = AssetGraph(self.Session)
        self.styles = StyleService(self.Session)
        self.characters = CharacterService(self.Session)
        self.qa = QAEngine(self.Session)
        self.licenses = LicenseFirewall(self.Session)
        self.model_registry = ModelRegistry(self.Session, self.licenses)
        self.router = ModelRouter(self.Session, self.licenses)
        self.providers = ProviderManager(self.Session, secret=secret)
        self._seed_defaults()

    def _ensure_schema(self) -> None:
        """Forward-compat patch for DBs created before qa_policy, then versioned
        migrations (engine.kernel.migrations). Failures abort boot loudly."""
        from sqlalchemy import inspect, text

        from engine.kernel.migrations import run_migrations

        try:
            cols = {c["name"] for c in inspect(self.engine).get_columns("tasks")}
            if "qa_policy" not in cols:
                with self.engine.begin() as conn:
                    conn.execute(text("ALTER TABLE tasks ADD COLUMN qa_policy JSON"))
            run_migrations(self.engine)
        except RuntimeError:
            raise
        except Exception as exc:  # noqa: BLE001 - a broken migration must be visible
            logger.exception("schema migration failed", exc_info=exc)
            raise

    def _seed_defaults(self) -> None:
        """Idempotent seeding: licensing registry + candidate model records."""
        try:
            self.licenses.seed_if_empty()
            self.model_registry.seed_defaults()
        except Exception as exc:  # noqa: BLE001
            logger.exception("default seeding failed", exc_info=exc)

    # ------------------------------------------------------------------ submit

    def submit_graph(
        self,
        name: str,
        tasks: list[dict],
        edges: list[dict],
        priority: int = 0,
        project_id: str | None = None,
    ) -> str:
        if not tasks:
            raise GraphError("task graph must contain at least one task")
        seen: set[str] = set()
        for t in tasks:
            if t["id"] in seen:
                raise GraphError(f"duplicate task id: {t['id']}")
            seen.add(t["id"])
            policy = t.get("qa_policy")
            if policy is not None and policy.get("kind") not in QA_KINDS:
                raise GraphError(
                    f"unknown qa_policy kind: {policy.get('kind')!r} (known: {sorted(QA_KINDS)})"
                )
        specs = [TaskSpec(id=t["id"], kind=t["kind"], params=t.get("params") or {}) for t in tasks]
        edge_specs = [EdgeSpec(task=e["task"], depends_on=e["depends_on"]) for e in edges]
        TaskGraph(specs, edge_specs)  # raises GraphError on invalid graphs
        job_id = uuid.uuid4().hex
        with self.Session() as s:
            if project_id is not None and s.get(Project, project_id) is None:
                raise KeyError(project_id)
            s.add(Job(id=job_id, name=name, status="QUEUED", priority=priority, project_id=project_id))
            internal: dict[str, str] = {}
            for spec, t in zip(specs, tasks):
                iid = f"{job_id}_{spec.id}"  # filesystem-safe (used in worker workdirs)
                internal[spec.id] = iid
                s.add(
                    Task(
                        id=iid,
                        name=spec.id,
                        job_id=job_id,
                        kind=spec.kind,
                        params=spec.params,
                        qa_policy=t.get("qa_policy"),
                        status="PENDING",
                    )
                )
            for e in edge_specs:
                s.add(TaskEdge(task_id=internal[e.task], depends_on=internal[e.depends_on]))
            s.commit()
        self.events.emit("job.updated", {"job_id": job_id, "status": "QUEUED"})
        return job_id

    # ------------------------------------------------------------- scheduling

    def tick(self) -> None:
        """Advance every active job: find one ready task per job, dispatch up to
        max_parallel of them concurrently, then reconcile. Safe to call repeatedly."""
        with self.Session() as s:
            jobs = s.scalars(
                select(Job).where(Job.status.in_(ACTIVE_JOB_STATUSES)).order_by(Job.priority.desc(), Job.created_at)
            ).all()
            ids = [j.id for j in jobs]
        ready: list[str] = []
        for job_id in ids:
            try:
                task_id = self._find_ready(job_id)
                if task_id:
                    ready.append(task_id)
            except Exception as exc:  # noqa: BLE001 - the poll loop must survive
                logger.exception("tick error on job %s", job_id, exc_info=exc)
        if ready:
            batch = ready[: self.max_parallel]
            if len(batch) == 1:
                self._dispatch_and_reap(batch[0])
            else:
                if self._executor is None:
                    self._executor = ThreadPoolExecutor(max_workers=self.max_parallel, thread_name_prefix="uce-dispatch")
                futures = [self._executor.submit(self._dispatch_and_reap, tid) for tid in batch]
                for f in futures:
                    try:
                        f.result()
                    except Exception:  # noqa: BLE001
                        logger.exception("parallel dispatch error", exc_info=True)
        for job_id in ids:
            try:
                self._reconcile_job(job_id)
            except Exception as exc:  # noqa: BLE001
                logger.exception("reconcile error on job %s", job_id, exc_info=exc)

    def _find_ready(self, job_id: str) -> str | None:
        """Return the next runnable task of a job, committing its manifest hash."""
        with self.Session() as s:
            job = s.get(Job, job_id)
            if job is None or job.status in TERMINAL_STATUSES:
                return None
            graph = self._load_graph(s, job_id)
            nxt = self._next_runnable(s, graph, job_id)
            if nxt is None:
                return None
            task_id = nxt.id
            input_hashes = self._input_hashes(s, graph, task_id)
            nxt.manifest_hash = manifest_hash(nxt.kind, nxt.params or {}, graph.all_artifacts_hashes(task_id, input_hashes))
            s.commit()
            return task_id

    def _reconcile_job(self, job_id: str) -> None:
        with self.Session() as s:
            job = s.get(Job, job_id)
            if job is not None and job.status not in TERMINAL_STATUSES:
                self._reconcile(s, job, self._load_graph(s, job_id))

    def process_job(self, job_id: str, timeout: float = 60.0) -> str:
        """Drive a job to a terminal state (convenience for tests/CLI)."""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            with self.Session() as s:
                job = s.get(Job, job_id)
                if job is None:
                    raise KeyError(job_id)
                status = job.status
            if status in TERMINAL_STATUSES:
                return status
            self.tick()
            time.sleep(0.02)
        with self.Session() as s:
            return s.get(Job, job_id).status

    def _next_runnable(self, s: Session, graph: TaskGraph, job_id: str) -> Task | None:
        tasks = {t.id: t for t in s.scalars(select(Task).where(Task.job_id == job_id)).all()}
        for tid in graph.topo_order():
            task = tasks[tid]
            if task.status != "PENDING":
                continue
            if all(tasks[d].status == "COMPLETED" for d in graph.depends_on(tid)):
                return task
        return None

    def _input_hashes(self, s: Session, graph: TaskGraph, task_id: str) -> dict[str, list[str]]:
        out: dict[str, list[str]] = {}
        for dep in graph.depends_on(task_id):
            hashes = s.scalars(select(Artifact.sha256).where(Artifact.task_id == dep).order_by(Artifact.name)).all()
            out[dep] = list(hashes)
        return out

    def _dispatch_and_reap(self, task_id: str) -> None:
        env = os.environ.copy()
        env["UCE_DB_URL"] = self.db_url
        env["UCE_STORAGE_ROOT"] = self.storage_root
        env["PYTHONPATH"] = str(self._repo_root) + os.pathsep + env.get("PYTHONPATH", "")
        proc = subprocess.Popen(
            [sys.executable, "-m", "engine.kernel.worker", task_id],
            env=env,
            cwd=self._repo_root,
        )
        with self.Session() as s:
            task = s.get(Task, task_id)
            task.pid = proc.pid
            job_id = task.job_id
            s.commit()
        self.events.emit("task.started", {"job_id": job_id, "task_id": task_id, "pid": proc.pid})
        # Wall-clock budget: a hung worker must never block the scheduler (audit #1).
        with self.Session() as s:
            timeout_s = float((s.get(Task, task_id).params or {}).get("timeout_s", self.task_timeout_s))
        timed_out = False
        try:
            returncode = proc.wait(timeout=max(1.0, timeout_s))
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
            returncode = proc.returncode if proc.returncode is not None else -1
            timed_out = True

        with self.Session() as s:
            task = s.get(Task, task_id)
            if timed_out and task.status == "RUNNING":
                record = record_error(
                    s,
                    job_id=job_id,
                    task_id=task_id,
                    exc=UCEError(
                        f"worker exceeded its wall-clock budget ({timeout_s:.0f}s) and was killed",
                        code="WORKER_TIMEOUT",
                        task_kind=task.kind,
                        resource="worker",
                        suggested_fix="raise params.timeout_s / UCE_TASK_TIMEOUT_S, or split the task",
                    ),
                    task_kind=task.kind,
                    resource="worker",
                )
                task.status = "FAILED"
                task.error_id = record.id
                record_telemetry(
                    s,
                    job_id=job_id,
                    task_id=task_id,
                    time_ms=timeout_s * 1000,
                    result="FAILED",
                    error_id=record.id,
                    resource="worker",
                )
            elif task.status == "RUNNING":
                # Worker died without updating its row — hard crash.
                record = record_error(
                    s,
                    job_id=job_id,
                    task_id=task_id,
                    exc=UCEError(
                        f"worker process exited unexpectedly (code {returncode})",
                        code="WORKER_DIED",
                        task_kind=task.kind,
                        resource="worker",
                        suggested_fix="resume the job; the task re-runs from its checkpoint",
                    ),
                    task_kind=task.kind,
                    resource="worker",
                )
                task.status = "FAILED"
                task.error_id = record.id
                record_telemetry(
                    s,
                    job_id=job_id,
                    task_id=task_id,
                    time_ms=0.0,
                    result="FAILED",
                    error_id=record.id,
                    resource="worker",
                )
            job = s.get(Job, job_id)
            if task.status == "COMPLETED" and task.qa_policy:
                qa_failures = self._run_task_qa(s, task, job)
                if qa_failures is not None:
                    if (task.attempt or 0) < self.max_attempts:
                        task.status = "PENDING"  # automatic repair cycle (§49)
                        if job is not None and job.status not in TERMINAL_STATUSES:
                            job.status = "REPAIR"
                    else:
                        record = record_error(
                            s,
                            job_id=job_id,
                            task_id=task_id,
                            exc=UCEError(
                                "QA failed after the repair budget was exhausted",
                                code="QA_FAILED",
                                task_kind=task.kind,
                                resource="qa",
                                suggested_fix="inspect /api/qa/reports; fix the generator or raise the budget",
                            ),
                            task_kind=task.kind,
                            resource="qa",
                        )
                        task.status = "FAILED"
                        task.error_id = record.id
                        record_telemetry(
                            s,
                            job_id=job_id,
                            task_id=task_id,
                            time_ms=0.0,
                            result="FAILED",
                            error_id=record.id,
                            resource="qa",
                        )
            if task.status == "FAILED" and (task.attempt or 0) < self.max_attempts:
                task.status = "PENDING"  # retry on a later tick
            final_status = task.status
            s.commit()
        # Yield the CPU: each dispatch runs a subprocess; without a pause the poll
        # loop spins hot between retries (34-70s waits observed in CI timings).
        time.sleep(0.05)
        payload = {"job_id": job_id, "task_id": task_id}
        if final_status == "COMPLETED":
            self.events.emit("task.completed", payload)
        elif final_status == "FAILED":
            self.events.emit("task.failed", payload)

    def _run_task_qa(self, s: Session, task: Task, job: Job | None) -> list[str] | None:
        """Run the task's QA policy over its artifacts (Master Prompt §45–49).

        Returns the list of failed check names, or None when everything passes.
        A QA tool that cannot run (e.g. ffprobe missing) is a recorded failure —
        QA never fakes a pass. Runs inside the caller's session (SQLite locks).
        """
        policy = task.qa_policy or {}
        kind = policy["kind"]
        params = policy.get("params") or {}
        artifacts = s.scalars(select(Artifact).where(Artifact.task_id == task.id)).all()
        if job is not None and job.status not in TERMINAL_STATUSES:
            job.status = "QA"
        failures: list[str] = []
        report_ids: list[str] = []
        if not artifacts:
            failures.append("no_artifact")
        for a in artifacts:
            data = self.store.read_bytes(a.sha256)
            try:
                report = self.qa.record(
                    kind,
                    data,
                    subject_kind="artifact",
                    subject_id=a.id,
                    params=params,
                    job_id=task.job_id,
                    task_id=task.id,
                    session=s,
                )
            except QAUnavailable as exc:
                failures.append(f"{a.name}:qa_unavailable:{exc}")
                continue
            report_ids.append(report["id"])
            if not report["passed"]:
                failures.extend(
                    f"{a.name}:{c['name']}"
                    for c in report["checks"]
                    if not c["passed"] and c["severity"] == "error"
                )
        if failures:
            s.add(
                RepairAttempt(
                    job_id=task.job_id,
                    task_id=task.id,
                    attempt=task.attempt or 0,
                    diagnosis="; ".join(failures)[:2000],
                    action="requeue",
                    qa_report_ids=report_ids,
                )
            )
            self.events.emit(
                "task.qa_failed",
                {"job_id": task.job_id, "task_id": task.id, "diagnosis": "; ".join(failures)},
            )
            return failures
        self.events.emit("task.qa_passed", {"job_id": task.job_id, "task_id": task.id})
        return None

    def _check_quota(self, s: Session, project_id: str, incoming: int) -> None:
        if self.project_quota_bytes <= 0:
            return
        total = (
            s.scalar(select(func.coalesce(func.sum(Asset.size), 0)).where(Asset.project_id == project_id)) or 0
        )
        if total + incoming > self.project_quota_bytes:
            raise QuotaExceeded(int(total) + incoming, self.project_quota_bytes)

    def _reconcile(self, s: Session, job: Job, graph: TaskGraph) -> None:
        # SQLite sessions opened by the poll loop see stale data if the WAL reader
        # snapshot predates a worker's commit; force a fresh read.
        s.expire_all()
        if job.status in TERMINAL_STATUSES:
            return
        tasks = {t.id: t for t in s.scalars(select(Task).where(Task.job_id == job.id)).all()}
        if all(t.status == "COMPLETED" for t in tasks.values()):
            job.status = "COMPLETED"
        elif job.status == "CANCELLED" or any(t.status == "CANCELLED" for t in tasks.values()):
            job.status = "CANCELLED"
        else:
            failed = [t for t in tasks.values() if t.status == "FAILED"]
            if failed and all((t.attempt or 0) >= self.max_attempts for t in failed):
                job.status = "FAILED"
                job.error_id = failed[0].error_id
            else:
                if job.status in ("QA", "REPAIR"):  # progressing again after a repair cycle
                    job.status = "RUNNING"
                    s.commit()
                return  # still progressing (or awaiting retry dispatch)
        s.commit()
        self.events.emit("job.updated", {"job_id": job.id, "status": job.status})

    # ------------------------------------------------------------ lifecycle

    def resume_job(self, job_id: str) -> None:
        """Continue from the last checkpoint: re-run failed/cancelled/stale tasks only
        (Master Prompt §61 — never repeat what already passed)."""
        with self.Session() as s:
            job = s.get(Job, job_id)
            if job is None:
                raise KeyError(job_id)
            job.status = "QUEUED"
            for t in s.scalars(select(Task).where(Task.job_id == job_id)).all():
                if t.status in ("FAILED", "CANCELLED", "RUNNING"):
                    t.status = "PENDING"
            s.commit()
        self.events.emit("job.updated", {"job_id": job_id, "status": "QUEUED"})

    def cancel_job(self, job_id: str) -> None:
        with self.Session() as s:
            job = s.get(Job, job_id)
            if job is None:
                raise KeyError(job_id)
            if job.status in TERMINAL_STATUSES:
                return
            job.status = "CANCELLED"
            for t in s.scalars(select(Task).where(Task.job_id == job_id, Task.status == "PENDING")).all():
                t.status = "CANCELLED"
            s.commit()
        self.events.emit("job.updated", {"job_id": job_id, "status": "CANCELLED"})

    def recover_stale(self) -> list[str]:
        """Single-instance semantics: any RUNNING task at recovery time belongs to
        a dead worker, so it is reset for re-dispatch. Multi-instance safety is the
        PID/lock file in acquire_instance_lock() — serve/init refuse to run twice."""
        recovered: list[str] = []
        with self.Session() as s:
            for t in s.scalars(select(Task).where(Task.status == "RUNNING")).all():
                t.status = "PENDING"
                recovered.append(t.id)
            for j in s.scalars(select(Job).where(Job.status == "RUNNING")).all():
                j.status = "QUEUED"
            s.commit()
        return recovered

    # ----------------------------------------------------------- instance lock

    def acquire_instance_lock(self) -> Path | None:
        """Refuse a second kernel on the same data dir (recover_stale would eat the
        first instance's RUNNING tasks). Returns the lock path, or None if held."""
        from engine.kernel.models import Base as _B  # noqa: F401 - ensure import side effects exist

        lock = Path(self.storage_root).parent / "kernel.lock"
        lock.parent.mkdir(parents=True, exist_ok=True)
        if lock.exists():
            try:
                pid = int(lock.read_text(encoding="utf-8").strip() or 0)
            except ValueError:
                pid = 0
            if pid and _pid_alive(pid):
                return None  # another live instance holds it
            logger.warning("stale instance lock (pid %s gone) — taking over", pid)
        lock.write_text(str(os.getpid()), encoding="utf-8")
        self._lock_path: Path | None = lock
        return lock

    def release_instance_lock(self) -> None:
        lock = getattr(self, "_lock_path", None)
        if lock is not None and lock.exists():
            lock.unlink(missing_ok=True)
            self._lock_path = None

    # ------------------------------------------------------------------ prune

    def prune(self, events_days: int = 30, telemetry_days: int = 30) -> dict:
        """Retention for observability tables (audit item: unbounded growth)."""
        from datetime import timedelta

        from engine.kernel.models import EventRecord

        cutoff_e = datetime.now(timezone.utc) - timedelta(days=max(0, events_days))
        cutoff_t = datetime.now(timezone.utc) - timedelta(days=max(0, telemetry_days))
        with self.Session() as s:
            e = s.query(EventRecord).filter(EventRecord.created_at < cutoff_e).delete()
            t = s.query(TelemetryRow).filter(TelemetryRow.created_at < cutoff_t).delete()
            s.commit()
        return {"events_deleted": e, "telemetry_deleted": t}

    def list_events(self, job_id: str | None = None, topic: str | None = None, limit: int = 100) -> list[dict]:
        from engine.kernel.models import EventRecord

        with self.Session() as s:
            q = select(EventRecord).order_by(EventRecord.created_at.desc()).limit(max(1, limit))
            if job_id:
                q = q.where(EventRecord.job_id == job_id)
            if topic:
                q = q.where(EventRecord.topic == topic)
            rows = s.scalars(q).all()
        return [
            {"id": r.id, "topic": r.topic, "job_id": r.job_id, "payload": r.payload, "created_at": r.created_at.isoformat()}
            for r in rows
        ]

    def job_status_counts(self) -> dict[str, int]:
        with self.Session() as s:
            rows = s.execute(select(Job.status, func.count(Job.id)).group_by(Job.status)).all()
        return {status: count for status, count in rows}

    def list_jobs(self, status: str | None = None, project_id: str | None = None) -> list[dict]:
        with self.Session() as s:
            q = select(Job).order_by(Job.priority.desc(), Job.created_at)
            if status:
                q = q.where(Job.status == status)
            if project_id:
                q = q.where(Job.project_id == project_id)
            jobs = s.scalars(q).all()
        return [self.get_job(j.id) for j in jobs]

    def get_job(self, job_id: str) -> dict:
        with self.Session() as s:
            job = s.get(Job, job_id)
            if job is None:
                raise KeyError(job_id)
            tasks = s.scalars(select(Task).where(Task.job_id == job_id).order_by(Task.created_at, Task.id)).all()
            artifacts = s.scalars(select(Artifact).where(Artifact.job_id == job_id).order_by(Artifact.created_at)).all()
        by_task: dict[str, list[Artifact]] = defaultdict(list)
        for a in artifacts:
            by_task[a.task_id].append(a)
        return {
            "id": job.id,
            "name": job.name,
            "status": job.status,
            "priority": job.priority,
            "project_id": job.project_id,
            "error_id": job.error_id,
            "created_at": _iso(job.created_at),
            "updated_at": _iso(job.updated_at),
            "tasks": [_task_dict(t, by_task.get(t.id, [])) for t in tasks],
        }

    def get_task(self, task_id: str) -> dict:
        with self.Session() as s:
            task = s.get(Task, task_id)
            if task is None:
                raise KeyError(task_id)
            artifacts = s.scalars(select(Artifact).where(Artifact.task_id == task_id).order_by(Artifact.name)).all()
        return _task_dict(task, list(artifacts))

    def list_artifacts(self, job_id: str | None = None) -> list[dict]:
        with self.Session() as s:
            q = select(Artifact).order_by(Artifact.created_at)
            if job_id:
                q = q.where(Artifact.job_id == job_id)
            rows = s.scalars(q).all()
        return [_artifact_dict(a) for a in rows]

    def artifact_content(self, artifact_id: str) -> bytes:
        with self.Session() as s:
            a = s.get(Artifact, artifact_id)
            if a is None:
                raise KeyError(artifact_id)
            sha = a.sha256
        return self.store.read_bytes(sha)

    def artifact_sha(self, artifact_id: str) -> str:
        with self.Session() as s:
            a = s.get(Artifact, artifact_id)
            if a is None:
                raise KeyError(artifact_id)
            return a.sha256

    def list_errors(self, job_id: str | None = None) -> list[dict]:
        with self.Session() as s:
            q = select(ErrorRecord).order_by(ErrorRecord.created_at)
            if job_id:
                q = q.where(ErrorRecord.job_id == job_id)
            rows = s.scalars(q).all()
        return [
            {
                "id": r.id, "job_id": r.job_id, "task_id": r.task_id, "code": r.code,
                "message": r.message, "cause": r.cause, "task_kind": r.task_kind,
                "resource": r.resource, "stack": r.stack, "suggested_fix": r.suggested_fix,
                "status": r.status, "created_at": _iso(r.created_at),
            }
            for r in rows
        ]

    def list_telemetry(self, job_id: str | None = None) -> list[dict]:
        with self.Session() as s:
            q = select(TelemetryRow).order_by(TelemetryRow.created_at)
            if job_id:
                q = q.where(TelemetryRow.job_id == job_id)
            rows = s.scalars(q).all()
        return [
            {
                "id": r.id, "job_id": r.job_id, "task_id": r.task_id, "model": r.model,
                "resource": r.resource, "time_ms": r.time_ms, "ram_mb": r.ram_mb,
                "vram_mb": r.vram_mb, "result": r.result, "error_id": r.error_id,
                "created_at": _iso(r.created_at),
            }
            for r in rows
        ]

    # ------------------------------------------------------- users (auth/RBAC)

    def create_user(self, username: str, password: str, role: str = "USER") -> dict:
        username = username.strip()
        if not username or not password:
            raise ValueError("username and password are required")
        if len(password) < 8:
            raise ValueError("password must be at least 8 characters")
        with self.Session() as s:
            if s.scalar(select(User).where(User.username == username)):
                raise ValueError("username already exists")
            is_first = s.scalar(select(func.count(User.id))) == 0
            final_role = "ADMIN" if is_first else role
            user = User(username=username, password_hash=hash_password(password), role=final_role)
            s.add(user)
            s.commit()
            logger.info("created user %s (role=%s)", username, final_role)
            return self._user_dict(user)

    def get_user(self, user_id: str) -> dict:
        with self.Session() as s:
            user = s.get(User, user_id)
            if user is None:
                raise KeyError(user_id)
            return self._user_dict(user)

    def get_user_by_username(self, username: str) -> dict | None:
        with self.Session() as s:
            user = s.scalar(select(User).where(User.username == username))
            return self._user_dict(user) if user else None

    def list_users(self) -> list[dict]:
        with self.Session() as s:
            users = s.scalars(select(User).order_by(User.created_at)).all()
        return [self._user_dict(u) for u in users]

    def _user_dict(self, user: User) -> dict:
        return {
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "created_at": _iso(user.created_at),
        }

    # ---------------------------------------------------------------- projects

    def create_project(self, name: str, owner_id: str, description: str = "") -> dict:
        name = name.strip()
        if not name:
            raise ValueError("project name is required")
        with self.Session() as s:
            if s.get(User, owner_id) is None:
                raise KeyError(owner_id)
            project = Project(name=name, description=description, owner_id=owner_id, status="ACTIVE")
            s.add(project)
            s.commit()
            return self._project_dict(project)

    def list_projects(self, owner_id: str | None = None) -> list[dict]:
        with self.Session() as s:
            q = select(Project).order_by(Project.created_at)
            if owner_id:
                q = q.where(Project.owner_id == owner_id)
            projects = s.scalars(q).all()
        return [self._project_dict(p) for p in projects]

    def get_project(self, project_id: str) -> dict:
        with self.Session() as s:
            project = s.get(Project, project_id)
            if project is None:
                raise KeyError(project_id)
            return self._project_dict(project)

    def update_project(self, project_id: str, name: str | None = None, description: str | None = None) -> dict:
        with self.Session() as s:
            project = s.get(Project, project_id)
            if project is None:
                raise KeyError(project_id)
            if name is not None:
                if not name.strip():
                    raise ValueError("project name cannot be empty")
                project.name = name.strip()
            if description is not None:
                project.description = description
            s.commit()
            return self._project_dict(project)

    def archive_project(self, project_id: str) -> dict:
        with self.Session() as s:
            project = s.get(Project, project_id)
            if project is None:
                raise KeyError(project_id)
            project.status = "ARCHIVED"
            s.commit()
            return self._project_dict(project)

    def _project_dict(self, project: Project) -> dict:
        with self.Session() as s:
            asset_count = s.scalar(select(func.count(Asset.id)).where(Asset.project_id == project.id)) or 0
        return {
            "id": project.id,
            "name": project.name,
            "description": project.description,
            "status": project.status,
            "owner_id": project.owner_id,
            "asset_count": asset_count,
            "created_at": _iso(project.created_at),
            "updated_at": _iso(project.updated_at),
        }

    # ------------------------------------------------------------------ assets

    def create_asset(self, project_id: str, name: str, kind: str, data: bytes, note: str = "") -> dict:
        name = name.strip()
        if not name:
            raise ValueError("asset name is required")
        with self.Session() as s:
            if s.get(Project, project_id) is None:
                raise KeyError(project_id)
            self._check_quota(s, project_id, len(data))
            sha = self.store.put_bytes(data)
            asset = Asset(
                project_id=project_id,
                name=name,
                kind=kind or "file",
                current_sha256=sha,
                size=len(data),
                version=1,
            )
            s.add(asset)
            s.flush()  # populate asset.id before the version row references it
            s.add(
                AssetVersion(asset_id=asset.id, version=1, sha256=sha, size=len(data), note=note)
            )
            s.commit()
            return self._asset_dict(asset)

    def list_assets(self, project_id: str) -> list[dict]:
        with self.Session() as s:
            assets = s.scalars(
                select(Asset).where(Asset.project_id == project_id).order_by(Asset.created_at)
            ).all()
        return [self._asset_dict(a) for a in assets]

    def get_asset(self, asset_id: str) -> dict:
        with self.Session() as s:
            asset = s.get(Asset, asset_id)
            if asset is None:
                raise KeyError(asset_id)
            return self._asset_dict(asset)

    def asset_versions(self, asset_id: str) -> list[dict]:
        with self.Session() as s:
            if s.get(Asset, asset_id) is None:
                raise KeyError(asset_id)
            versions = s.scalars(
                select(AssetVersion).where(AssetVersion.asset_id == asset_id).order_by(AssetVersion.version)
            ).all()
        return [
            {
                "id": v.id,
                "asset_id": v.asset_id,
                "version": v.version,
                "sha256": v.sha256,
                "size": v.size,
                "note": v.note,
                "created_at": _iso(v.created_at),
            }
            for v in versions
        ]

    def add_asset_version(self, asset_id: str, data: bytes, note: str = "") -> dict:
        with self.Session() as s:
            asset = s.get(Asset, asset_id)
            if asset is None:
                raise KeyError(asset_id)
            self._check_quota(s, asset.project_id, len(data))
            max_version = (
                s.scalar(select(func.max(AssetVersion.version)).where(AssetVersion.asset_id == asset_id)) or 0
            )
            next_version = max_version + 1
            sha = self.store.put_bytes(data)
            asset.current_sha256 = sha
            asset.size = len(data)
            asset.version = next_version
            s.add(
                AssetVersion(asset_id=asset_id, version=next_version, sha256=sha, size=len(data), note=note)
            )
            s.commit()
            return self._asset_dict(asset)

    def rollback_asset(self, asset_id: str, version: int) -> dict:
        with self.Session() as s:
            asset = s.get(Asset, asset_id)
            if asset is None:
                raise KeyError(asset_id)
            target = s.scalar(
                select(AssetVersion).where(
                    AssetVersion.asset_id == asset_id, AssetVersion.version == version
                )
            )
            if target is None:
                raise ValueError(f"version {version} does not exist")
            asset.current_sha256 = target.sha256
            asset.size = target.size
            asset.version = version
            s.commit()
            logger.info("asset %s rolled back to version %s", asset_id, version)
            return self._asset_dict(asset)

    def asset_content(self, asset_id: str) -> bytes:
        with self.Session() as s:
            asset = s.get(Asset, asset_id)
            if asset is None:
                raise KeyError(asset_id)
            sha = asset.current_sha256
        return self.store.read_bytes(sha)

    def _asset_dict(self, asset: Asset) -> dict:
        return {
            "id": asset.id,
            "project_id": asset.project_id,
            "name": asset.name,
            "kind": asset.kind,
            "sha256": asset.current_sha256,
            "size": asset.size,
            "version": asset.version,
            "created_at": _iso(asset.created_at),
            "updated_at": _iso(asset.updated_at),
        }

    # ---------------------------------------------------------------- internal

    def _load_graph(self, s: Session, job_id: str) -> TaskGraph:
        tasks = s.scalars(select(Task).where(Task.job_id == job_id).order_by(Task.created_at, Task.id)).all()
        edges = s.scalars(
            select(TaskEdge)
            .join(Task, Task.id == TaskEdge.task_id)
            .where(Task.job_id == job_id)
        ).all()
        return TaskGraph(
            [TaskSpec(id=t.id, kind=t.kind, params=t.params or {}) for t in tasks],
            [EdgeSpec(task=e.task_id, depends_on=e.depends_on) for e in edges],
        )


def _task_dict(task: Task, artifacts: list[Artifact]) -> dict:
    return {
        "id": task.name,
        "task_id": task.id,
        "job_id": task.job_id,
        "kind": task.kind,
        "params": task.params,
        "manifest_hash": task.manifest_hash,
        "status": task.status,
        "attempt": task.attempt,
        "pid": task.pid,
        "error_id": task.error_id,
        "created_at": _iso(task.created_at),
        "updated_at": _iso(task.updated_at),
        "completed_at": _iso(task.completed_at) if task.completed_at else None,
        "artifacts": [_artifact_dict(a) for a in artifacts],
    }


def _artifact_dict(a: Artifact) -> dict:
    return {
        "id": a.id,
        "job_id": a.job_id,
        "task_id": a.task_id,
        "name": a.name,
        "kind": a.kind,
        "sha256": a.sha256,
        "size": a.size,
        "created_at": _iso(a.created_at),
    }


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None