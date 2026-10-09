"""Observability rows (Master Prompt §70): task, model, resource, time, VRAM,
RAM, result, QA, error, repair. M0 records task/resource/time/RAM/result/error;
model/VRAM fields exist and are filled by inference adapters in later phases.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from engine.kernel.models import TelemetryRow


def record_telemetry(
    session: Session,
    *,
    job_id: str,
    task_id: str,
    time_ms: float,
    result: str,
    error_id: str | None = None,
    model: str | None = None,
    ram_mb: int | None = None,
    vram_mb: int | None = None,
    resource: str = "cpu",
) -> None:
    session.add(
        TelemetryRow(
            id=uuid.uuid4().hex,
            job_id=job_id,
            task_id=task_id,
            model=model,
            resource=resource,
            time_ms=round(time_ms, 1),
            ram_mb=ram_mb,
            vram_mb=vram_mb,
            result=result,
            error_id=error_id,
            created_at=datetime.now(timezone.utc),
        )
    )