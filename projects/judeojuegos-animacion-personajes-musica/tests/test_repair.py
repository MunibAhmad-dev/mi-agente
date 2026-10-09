"""Automatic repair loop tests (Master Prompt §49)."""

from __future__ import annotations

from sqlalchemy import select

from engine.kernel.models import ErrorRecord, QAReport, RepairAttempt
from tests.conftest import run_until


def _submit(kernel, kind: str, params: dict, qa: dict) -> str:
    return kernel.submit_graph(
        name=f"repair-{kind}",
        tasks=[{"id": "t", "kind": kind, "params": params, "qa_policy": qa}],
        edges=[],
    )


def test_qa_failure_exhausts_budget(kernel):
    job_id = _submit(
        kernel, "core.write_text", {"name": "short.txt", "content": "x"},
        {"kind": "text", "params": {"min_length": 1000}},
    )
    job = run_until(kernel, job_id)
    assert job["status"] == "FAILED"
    # Every attempt was QA-checked and every failure recorded.
    reports = kernel.qa.list_reports(job_id=job_id)
    assert len(reports) == kernel.max_attempts
    assert all(not r["passed"] for r in reports)
    with kernel.Session() as s:
        repairs = s.scalars(select(RepairAttempt).where(RepairAttempt.job_id == job_id)).all()
        assert len(repairs) == kernel.max_attempts
        codes = s.scalars(select(ErrorRecord.code).where(ErrorRecord.job_id == job_id)).all()
        assert "QA_FAILED" in codes


def test_repair_loop_converges(kernel):
    job_id = _submit(
        kernel, "core.grow_text", {"name": "grown.txt", "content": "abcdefghij"},
        {"kind": "text", "params": {"min_length": 15}},  # 10 < 15 fails; 20 >= 15 passes
    )
    job = run_until(kernel, job_id)
    assert job["status"] == "COMPLETED"
    task = job["tasks"][0]
    assert task["attempt"] >= 2, "repair should have re-run the task"
    # Exactly one passing QA report on the final artifact; the failing one kept.
    reports = kernel.qa.list_reports(job_id=job_id)
    assert any(r["passed"] for r in reports)
    assert any(not r["passed"] for r in reports)  # history preserved, not hidden
    with kernel.Session() as s:
        assert s.scalars(select(RepairAttempt).where(RepairAttempt.job_id == job_id)).all()


def test_no_qa_policy_no_repair_rows(kernel):
    job_id = kernel.submit_graph(
        name="plain",
        tasks=[{"id": "t", "kind": "core.write_text", "params": {"name": "a.txt", "content": "fine"}}],
        edges=[],
    )
    job = run_until(kernel, job_id)
    assert job["status"] == "COMPLETED"
    assert kernel.qa.list_reports(job_id=job_id) == []
    with kernel.Session() as s:
        assert s.scalars(select(RepairAttempt).where(RepairAttempt.job_id == job_id)).all() == []


def test_invalid_qa_kind_rejected_at_submit(kernel):
    import pytest

    from engine.kernel.taskgraph import GraphError

    with pytest.raises(GraphError):
        kernel.submit_graph(
            name="bad",
            tasks=[{"id": "t", "kind": "core.write_text", "params": {}, "qa_policy": {"kind": "vibes"}}],
            edges=[],
        )


def test_qa_reports_have_full_metadata(kernel):
    job_id = _submit(
        kernel, "core.write_text", {"name": "ok.txt", "content": "long enough content"},
        {"kind": "text", "params": {"min_length": 5}},
    )
    run_until(kernel, job_id)
    reports = kernel.qa.list_reports(job_id=job_id)
    assert len(reports) == 1
    report = reports[0]
    assert report["subject_kind"] == "artifact"
    assert report["subject_id"] and report["task_id"] and report["kind"] == "text"
    assert all("severity" in c for c in report["checks"])
