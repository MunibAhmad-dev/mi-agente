"""Durable work queue (spec §63 LOCAL MODE, §66 idempotency, §118 scheduler).

A SQLite-backed task queue with:
- claim-with-lease (BEGIN IMMEDIATE): crashed workers' leases expire and tasks
  are re-claimed by survivors - no external broker needed
- idempotency keys: duplicate submissions return the existing task (§66)
- retries with attempt counting, then DEAD-lettering (never silent)
- priorities 1-6 (1 = highest: capital protection first, §118)
"""
from __future__ import annotations

import json
import uuid
from dataclasses import dataclass

from aeos.core.db import Database


@dataclass(frozen=True)
class Task:
    id: int
    kind: str
    payload: dict
    priority: int
    attempts: int
    max_attempts: int
    idempotency_key: str | None


class WorkQueue:
    def __init__(self, db: Database, lease_seconds: int = 60):
        self.db = db
        self.lease_seconds = lease_seconds

    def submit(self, kind: str, payload: dict | None = None, priority: int = 3,
               idempotency_key: str | None = None, max_attempts: int = 3) -> int | None:
        """Enqueue a task. Returns the task id, or None if the idempotency key
        already exists (duplicate submission is a no-op, §66)."""
        if not 1 <= priority <= 6:
            raise ValueError("priority must be 1..6")
        try:
            cur = self.db.execute(
                "INSERT INTO work_queue (kind, payload_json, priority, idempotency_key, max_attempts)"
                " VALUES (?, ?, ?, ?, ?)",
                (kind, json.dumps(payload or {}, default=str), priority,
                 idempotency_key, max_attempts),
            )
            return int(cur.lastrowid)
        except Exception as exc:
            if "UNIQUE" in str(exc):
                row = self.db.one(
                    "SELECT id FROM work_queue WHERE idempotency_key=?", (idempotency_key,)
                )
                return int(row["id"]) if row else None
            raise

    def claim(self, kinds: list[str] | None = None) -> Task | None:
        """Claim the highest-priority pending (or lease-expired) task.

        Uses BEGIN IMMEDIATE so two workers can never claim the same task.
        Expired RUNNING leases (crashed worker) are re-claimed automatically.
        """
        now = "datetime('now')"
        kind_filter = ""
        params: list = []
        if kinds:
            kind_filter = f"AND kind IN ({','.join('?' * len(kinds))})"
            params = list(kinds)
        with self.db.transaction() as conn:
            row = conn.execute(
                f"""SELECT * FROM work_queue
                    WHERE (status='PENDING')
                       OR (status='RUNNING' AND lease_until IS NOT NULL
                           AND lease_until < datetime('now'))
                    {kind_filter}
                    ORDER BY priority ASC, id ASC LIMIT 1""",
                tuple(params),
            ).fetchone()
            if not row:
                return None
            conn.execute(
                f"""UPDATE work_queue SET status='RUNNING',
                        lease_until=datetime('now', '+{int(self.lease_seconds)} seconds'),
                        attempts=attempts+1, updated_at={now}
                    WHERE id=?""",
                (row["id"],),
            )
            return Task(
                id=row["id"], kind=row["kind"], payload=json.loads(row["payload_json"]),
                priority=row["priority"], attempts=row["attempts"] + 1,
                max_attempts=row["max_attempts"], idempotency_key=row["idempotency_key"],
            )

    def complete(self, task_id: int) -> None:
        self.db.execute(
            "UPDATE work_queue SET status='DONE', lease_until=NULL, updated_at=datetime('now')"
            " WHERE id=?",
            (task_id,),
        )

    def fail(self, task_id: int, error: str) -> bool:
        """Record a failure; retry later if attempts remain, else DEAD-letter.
        Returns True if the task will be retried."""
        row = self.db.one("SELECT attempts, max_attempts FROM work_queue WHERE id=?", (task_id,))
        if not row:
            return False
        will_retry = row["attempts"] < row["max_attempts"]
        self.db.execute(
            "UPDATE work_queue SET status=?, last_error=?, lease_until=NULL,"
            " updated_at=datetime('now') WHERE id=?",
            ("PENDING" if will_retry else "DEAD", error[:2000], task_id),
        )
        return will_retry

    def renew_lease(self, task_id: int) -> None:
        self.db.execute(
            f"UPDATE work_queue SET lease_until=datetime('now', '+{int(self.lease_seconds)} seconds')"
            " WHERE id=?",
            (task_id,),
        )

    def stats(self) -> dict:
        rows = self.db.query(
            "SELECT status, COUNT(*) AS n FROM work_queue GROUP BY status"
        )
        return {r["status"]: r["n"] for r in rows}

    def dead_letters(self, limit: int = 50) -> list[dict]:
        return [dict(r) for r in self.db.query(
            "SELECT id, kind, attempts, last_error, created_at FROM work_queue"
            " WHERE status='DEAD' ORDER BY id DESC LIMIT ?",
            (limit,),
        )]
