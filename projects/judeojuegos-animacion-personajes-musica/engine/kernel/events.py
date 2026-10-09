"""In-process event bus with optional persistence (audit item: events must
survive restarts and be listable over HTTP).

Topics used by the kernel:
  task.started      payload: {"job_id", "task_id", "pid"}
  task.completed    payload: {"job_id", "task_id", "artifacts": [sha256...], "time_ms"}
  task.failed       payload: {"job_id", "task_id", "error_id", "attempt"}
  task.qa_passed    payload: {"job_id", "task_id"}
  task.qa_failed    payload: {"job_id", "task_id", "diagnosis"}
  job.updated       payload: {"job_id", "status"}
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Callable

Handler = Callable[[dict[str, Any]], None]
Sink = Callable[[str, dict[str, Any]], None]


class EventBus:
    def __init__(self, sink: Sink | None = None) -> None:
        self._handlers: dict[str, list[Handler]] = defaultdict(list)
        self._sink = sink

    def subscribe(self, topic: str, handler: Handler) -> None:
        self._handlers[topic].append(handler)

    def emit(self, topic: str, payload: dict[str, Any]) -> None:
        for handler in list(self._handlers.get(topic, ())):
            try:
                handler(payload)
            except Exception:  # noqa: BLE001 - a bad subscriber must not break the kernel
                pass
        if self._sink is not None:
            try:
                self._sink(topic, payload)
            except Exception:  # noqa: BLE001 - persistence must never break emit
                pass


def db_sink_factory(session_factory) -> Sink:
    """Build a sink that appends every event to the `events` table."""
    from engine.kernel.models import EventRecord

    def sink(topic: str, payload: dict[str, Any]) -> None:
        with session_factory() as s:
            s.add(
                EventRecord(
                    id=uuid.uuid4().hex,
                    topic=topic,
                    job_id=payload.get("job_id"),
                    payload=payload,
                    created_at=datetime.now(timezone.utc),
                )
            )
            s.commit()

    return sink
