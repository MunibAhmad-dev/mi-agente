"""M0 acceptance test (ROADMAP M0): kill a worker mid-run, resume from the
checkpoint, and prove the final artifacts are byte-identical to an uncrashed run.
"""

import hashlib

from engine.kernel import Kernel
from tests.conftest import run_until


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def crash_graph() -> dict:
    return {
        "name": "crash-demo",
        "tasks": [
            {"id": "t1", "kind": "core.write_text", "params": {"name": "a.txt", "content": "hello"}},
            {"id": "t2", "kind": "core.crash_once", "params": {"name": "c.txt", "content": "survived"}},
        ],
        "edges": [],
    }


def reference_graph() -> dict:
    return {
        "name": "reference",
        "tasks": [
            {"id": "t1", "kind": "core.write_text", "params": {"name": "a.txt", "content": "hello"}},
            {"id": "t2", "kind": "core.write_text", "params": {"name": "c.txt", "content": "survived"}},
        ],
        "edges": [],
    }


def test_crash_mid_run_then_resume_produces_same_hashes(tmp_path):
    # Budget 1: the crash exhausts the attempt budget so the job genuinely FAILs
    # and the resume path is exercised instead of an automatic in-loop retry.
    kernel = Kernel(db_url=f"sqlite:///{tmp_path / 'crash.db'}", storage_root=tmp_path / "assets", max_attempts=1)
    job_id = kernel.submit_graph(**crash_graph())

    crashed = run_until(kernel, job_id)
    assert crashed["status"] == "FAILED"
    t2 = next(t for t in crashed["tasks"] if t["id"] == "t2")
    assert t2["status"] == "FAILED" and t2["attempt"] == 1

    # The death must be recorded, never hidden (Master Prompt §71).
    errors = kernel.list_errors(job_id=job_id)
    worker_died = [e for e in errors if e["code"] == "WORKER_DIED"]
    assert worker_died and worker_died[0]["suggested_fix"]

    kernel.resume_job(job_id)
    done = run_until(kernel, job_id)
    assert done["status"] == "COMPLETED"
    t2 = next(t for t in done["tasks"] if t["id"] == "t2")
    assert t2["status"] == "COMPLETED" and t2["attempt"] == 2

    # Same result hashes as an uncrashed run (content-addressed equality).
    ref = run_until(kernel, kernel.submit_graph(**reference_graph()))
    assert ref["status"] == "COMPLETED"

    def sha_of(job, tid):
        t = next(t for t in job["tasks"] if t["id"] == tid)
        return t["artifacts"][0]["sha256"]

    assert sha_of(done, "t1") == sha_of(ref, "t1") == _sha("hello")
    assert sha_of(done, "t2") == sha_of(ref, "t2") == _sha("survived")

    # Telemetry records both the failure and the successful re-run.
    rows = kernel.list_telemetry(job_id=job_id)
    assert {r["result"] for r in rows} == {"FAILED", "COMPLETED"}