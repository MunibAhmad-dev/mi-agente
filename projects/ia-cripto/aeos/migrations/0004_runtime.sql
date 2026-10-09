-- Phase 2 (spec §63, §118): durable local work queue + orchestrator state.

CREATE TABLE IF NOT EXISTS work_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,                      -- task type (e.g. 'generation_cycle')
    payload_json TEXT NOT NULL DEFAULT '{}',
    priority INTEGER NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 6),
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','RUNNING','DONE','FAILED','DEAD')),
    idempotency_key TEXT UNIQUE,             -- §66: duplicate submits are no-ops
    lease_until TEXT,                        -- claimed lease expiry
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_queue_status_priority ON work_queue(status, priority, id);

CREATE TABLE IF NOT EXISTS workflow_runs (
    id TEXT PRIMARY KEY,                     -- workflow instance id
    workflow TEXT NOT NULL,                  -- 'economic_loop'
    phase TEXT NOT NULL,                     -- current phase name
    status TEXT NOT NULL DEFAULT 'RUNNING'
        CHECK (status IN ('RUNNING','COMPLETED','FAILED','ABORTED')),
    context_json TEXT NOT NULL DEFAULT '{}', -- checkpoint state for resume
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER IF NOT EXISTS work_queue_no_delete BEFORE DELETE ON work_queue
BEGIN
    SELECT RAISE(ABORT, 'work_queue is append-only; mark DONE/DEAD instead');
END;
