-- Phase 3 (spec §67, §121-122, §167j): reconciliation + provider health.

CREATE TABLE IF NOT EXISTS external_refs (
    provider TEXT NOT NULL,                  -- 'stripe' | 'binance' | 'postal' | ...
    external_id TEXT NOT NULL,               -- provider's own id (pi_xxx, order id)
    kind TEXT NOT NULL,                      -- payment | order | campaign | email
    amount_minor INTEGER,
    currency TEXT NOT NULL DEFAULT 'usd',
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','CONFIRMED','MISMATCH','REVERSED')),
    ledger_tx_id INTEGER,                    -- linked ledger entry once confirmed
    raw_json TEXT NOT NULL DEFAULT '{}',
    first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    confirmed_at TEXT,
    PRIMARY KEY (provider, external_id)
);

CREATE TABLE IF NOT EXISTS reconciliation_disputes (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    external_id TEXT NOT NULL,
    internal_amount_minor INTEGER,
    external_amount_minor INTEGER,
    detail TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED')),
    opened_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS provider_health (
    provider TEXT PRIMARY KEY,
    state TEXT NOT NULL DEFAULT 'CLOSED' CHECK (state IN ('CLOSED','OPEN','HALF_OPEN')),
    failures INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    opened_at TEXT,
    half_open_at TEXT
);
