"""Structured failure model (Master Prompt §71).

Every failure is a record: error, cause, task, model, resource, log, stack,
suggested fix, status. Errors are never hidden — they are written to the DB
and surfaced through the API.
"""

from __future__ import annotations

import traceback
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from engine.kernel.models import ErrorRecord


class UCEError(Exception):
    """Base error for the engine."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "UCE_ERROR",
        cause: str | None = None,
        task_kind: str | None = None,
        resource: str | None = None,
        suggested_fix: str | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.cause = cause
        self.task_kind = task_kind
        self.resource = resource
        self.suggested_fix = suggested_fix


def record_error(
    session: Session,
    *,
    job_id: str,
    task_id: str | None,
    exc: BaseException,
    task_kind: str | None = None,
    resource: str | None = None,
) -> ErrorRecord:
    """Persist an error and return the record. Never raises."""
    if isinstance(exc, UCEError):
        code = exc.code
        message = exc.message
        cause = exc.cause
        suggested_fix = exc.suggested_fix
        task_kind = task_kind or exc.task_kind
        resource = resource or exc.resource
    else:
        code = "INTERNAL"
        message = str(exc) or exc.__class__.__name__
        cause = exc.__class__.__name__
        suggested_fix = "Inspect the traceback and reproduce; retry with the task checkpoint."
    record = ErrorRecord(
        id=uuid.uuid4().hex,
        job_id=job_id,
        task_id=task_id,
        code=code,
        message=message[:4000],
        cause=cause,
        task_kind=task_kind,
        resource=resource,
        stack=traceback.format_exc()[:8000],
        suggested_fix=suggested_fix,
        status="OPEN",
        created_at=datetime.now(timezone.utc),
    )
    session.add(record)
    return record