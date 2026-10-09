import pytest

from engine.kernel import GraphError, Kernel
from tests.conftest import run_until


def demo_graph(fail_t2: bool = False) -> dict:
    t2 = {
        "id": "t2",
        "kind": "core.fail_once" if fail_t2 else "core.write_text",
        "params": {"name": "b.txt", "content": "world"},
    }
    return {
        "name": "demo",
        "tasks": [
            {"id": "t1", "kind": "core.write_text", "params": {"name": "a.txt", "content": "hello"}},
            t2,
            {"id": "t3", "kind": "core.concat_text", "params": {"name": "out.txt"}},
        ],
        "edges": [
            {"task": "t3", "depends_on": "t1"},
            {"task": "t3", "depends_on": "t2"},
        ],
    }


def artifact_sha(job: dict, task_id: str) -> str:
    task = next(t for t in job["tasks"] if t["id"] == task_id)
    assert task["artifacts"], f"task {task_id} produced no artifacts"
    return task["artifacts"][0]["sha256"]


def test_run_to_completion_and_determinism(kernel):
    job1 = run_until(kernel, kernel.submit_graph(**demo_graph()))
    assert job1["status"] == "COMPLETED"
    t3 = next(t for t in job1["tasks"] if t["id"] == "t3")
    content = kernel.artifact_content(t3["artifacts"][0]["id"]).decode()
    assert content == "helloworld"

    job2 = run_until(kernel, kernel.submit_graph(**demo_graph()))
    assert job2["status"] == "COMPLETED"
    assert artifact_sha(job1, "t1") == artifact_sha(job2, "t1")
    assert artifact_sha(job1, "t2") == artifact_sha(job2, "t2")
    assert artifact_sha(job1, "t3") == artifact_sha(job2, "t3")


def test_auto_retry_within_budget(kernel):
    """With retry budget 2, a transient failure self-heals: attempt 1 fails, attempt 2 succeeds."""
    job_id = kernel.submit_graph(**demo_graph(fail_t2=True))
    job = run_until(kernel, job_id)
    assert job["status"] == "COMPLETED"
    t2 = next(t for t in job["tasks"] if t["id"] == "t2")
    assert t2["status"] == "COMPLETED" and t2["attempt"] == 2


def test_transient_failure_then_resume_skips_passed_tasks(tmp_path):
    """With budget 1 the job genuinely FAILs; resume re-runs only the failed task
    (Master Prompt §61) and produces identical output."""
    kernel = Kernel(db_url=f"sqlite:///{tmp_path / 'resume.db'}", storage_root=tmp_path / "assets", max_attempts=1)
    job_id = kernel.submit_graph(**demo_graph(fail_t2=True))
    job = run_until(kernel, job_id)
    assert job["status"] == "FAILED"
    t2 = next(t for t in job["tasks"] if t["id"] == "t2")
    assert t2["status"] == "FAILED" and t2["attempt"] == 1
    assert next(t for t in job["tasks"] if t["id"] == "t3")["status"] == "PENDING"

    errors = kernel.list_errors(job_id=job_id)
    assert any(e["code"] == "SIMULATED_TRANSIENT" and e["suggested_fix"] for e in errors)

    kernel.resume_job(job_id)
    done = run_until(kernel, job_id)
    assert done["status"] == "COMPLETED"
    # Master Prompt §61: the passed task must not be re-executed.
    t1 = next(t for t in done["tasks"] if t["id"] == "t1")
    assert t1["attempt"] == 1
    t2 = next(t for t in done["tasks"] if t["id"] == "t2")
    assert t2["status"] == "COMPLETED" and t2["attempt"] == 2
    t3 = next(t for t in done["tasks"] if t["id"] == "t3")
    assert kernel.artifact_content(t3["artifacts"][0]["id"]).decode() == "helloworld"


def test_cancel_before_processing(kernel):
    job_id = kernel.submit_graph(**demo_graph())
    kernel.cancel_job(job_id)
    job = kernel.get_job(job_id)
    assert job["status"] == "CANCELLED"
    assert all(t["status"] == "CANCELLED" for t in job["tasks"])


def test_duplicate_task_ids_rejected(kernel):
    with pytest.raises(GraphError):
        kernel.submit_graph(
            name="dup",
            tasks=[
                {"id": "a", "kind": "core.write_text", "params": {"content": "1"}},
                {"id": "a", "kind": "core.write_text", "params": {"content": "2"}},
            ],
            edges=[],
        )
    with pytest.raises(GraphError):
        kernel.submit_graph(name="empty", tasks=[], edges=[])


def test_unknown_task_kind_fails_with_structured_error(kernel):
    job_id = kernel.submit_graph(name="bad-kind", tasks=[{"id": "a", "kind": "core.nope"}], edges=[])
    job = run_until(kernel, job_id)
    assert job["status"] == "FAILED"
    errors = kernel.list_errors(job_id=job_id)
    assert any(e["code"] == "UNKNOWN_TASK_KIND" and e["suggested_fix"] for e in errors)


def test_retry_exhaustion_stays_failed(kernel):
    """With budget 2, a handler that fails twice stays FAILED (no infinite retry)."""
    job_id = kernel.submit_graph(
        name="exhaust",
        tasks=[{"id": "a", "kind": "core.fail_twice", "params": {"name": "x.txt", "content": "never"}}],
        edges=[],
    )
    job = run_until(kernel, job_id)
    assert job["status"] == "FAILED"
    task = job["tasks"][0]
    assert task["status"] == "FAILED" and task["attempt"] == 2


def test_stale_running_task_is_recovered(kernel):
    job_id = kernel.submit_graph(**demo_graph())
    with kernel.Session() as s:
        from sqlalchemy import select

        from engine.kernel.models import Task

        t = s.scalars(select(Task).where(Task.job_id == job_id, Task.name == "t1")).one()
        t.status = "RUNNING"  # simulate a worker that died mid-task
        s.commit()
    assert len(kernel.recover_stale()) == 1
    done = run_until(kernel, job_id)
    assert done["status"] == "COMPLETED"