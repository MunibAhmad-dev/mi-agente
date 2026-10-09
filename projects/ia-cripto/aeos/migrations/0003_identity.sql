-- Phase 1 (spec §70, §167d): identity, permissions, approvals.

CREATE TABLE IF NOT EXISTS principals (
    id TEXT PRIMARY KEY,                    -- 'human:owner', 'service:scheduler', 'agent:<id>'
    kind TEXT NOT NULL CHECK (kind IN ('human','service','agent')),
    display_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'viewer',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    disabled INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS api_keys (
    prefix TEXT PRIMARY KEY,                -- visible key prefix (e.g. 'ak_3f2a')
    principal_id TEXT NOT NULL REFERENCES principals(id),
    key_hash TEXT NOT NULL,                 -- sha256(secret); the secret is never stored
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    revoked_at TEXT,
    last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,                   -- what is pending (e.g. 'live_trade')
    context_json TEXT NOT NULL DEFAULT '{}',
    required_level INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','DENIED','EXPIRED')),
    requested_by TEXT NOT NULL,
    decided_by TEXT,
    decided_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS system_flags (
    name TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_access (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL DEFAULT (datetime('now')),
    principal_id TEXT NOT NULL,
    resource TEXT NOT NULL,
    action TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS approvals_immutable_decision BEFORE UPDATE ON approvals
WHEN OLD.status != 'PENDING' AND OLD.status != NEW.status
BEGIN
    SELECT RAISE(ABORT, 'approval decision is immutable');
END;
