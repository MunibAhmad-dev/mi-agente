-- AEOS initial schema (spec §153): core economic + agent tables.
-- Money amounts are stored in minor units (cents) as INTEGER to avoid float drift.

CREATE TABLE IF NOT EXISTS treasury (
    bucket TEXT PRIMARY KEY,               -- RESERVE/OPERATING/EXPERIMENT/BUSINESS/INVESTMENT/RESEARCH/EMERGENCY
    balance_minor INTEGER NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
    allocated_minor INTEGER NOT NULL DEFAULT 0 CHECK (allocated_minor >= 0),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    generation INTEGER NOT NULL,
    parent_id TEXT REFERENCES agents(id),
    genome_version INTEGER NOT NULL DEFAULT 1,
    state TEXT NOT NULL DEFAULT 'CREATED',
    mission TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_economics (
    agent_id TEXT PRIMARY KEY REFERENCES agents(id),
    cash_minor INTEGER NOT NULL DEFAULT 0,
    allocated_minor INTEGER NOT NULL DEFAULT 0,
    revenue_minor INTEGER NOT NULL DEFAULT 0,
    expenses_minor INTEGER NOT NULL DEFAULT 0,
    risk_score REAL NOT NULL DEFAULT 0.0,
    information_gain REAL NOT NULL DEFAULT 0.0,
    survival_ticks INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS genome_versions (
    agent_id TEXT NOT NULL REFERENCES agents(id),
    version INTEGER NOT NULL,
    genome_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (agent_id, version)
);

CREATE TABLE IF NOT EXISTS cemetery (
    agent_id TEXT PRIMARY KEY,
    generation INTEGER NOT NULL,
    parent_id TEXT,
    genome_version INTEGER NOT NULL,
    strategy_dna TEXT NOT NULL DEFAULT '{}',
    capital_in_minor INTEGER NOT NULL DEFAULT 0,
    capital_spent_minor INTEGER NOT NULL DEFAULT 0,
    revenue_minor INTEGER NOT NULL DEFAULT 0,
    profit_minor INTEGER NOT NULL DEFAULT 0,
    experiments INTEGER NOT NULL DEFAULT 0,
    customers INTEGER NOT NULL DEFAULT 0,
    failure_category TEXT NOT NULL,
    failure_reason TEXT NOT NULL,
    lessons TEXT NOT NULL DEFAULT '[]',
    unknowns TEXT NOT NULL DEFAULT '[]',
    died_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS hall_of_fame (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,                    -- agent/strategy/mutation/product/campaign/experiment
    ref_id TEXT NOT NULL,
    metrics_json TEXT NOT NULL,
    why TEXT NOT NULL,                     -- WHY DID IT WIN? (spec §14)
    inducted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS strategy_dna (
    agent_id TEXT NOT NULL REFERENCES agents(id),
    version INTEGER NOT NULL,
    traits_json TEXT NOT NULL,
    parent_dna_version INTEGER,
    mutation_note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (agent_id, version)
);

CREATE TABLE IF NOT EXISTS predictions (
    id TEXT PRIMARY KEY,
    claim TEXT NOT NULL,
    probability REAL NOT NULL CHECK (probability >= 0 AND probability <= 1),
    confidence REAL NOT NULL,
    agent_id TEXT,
    strategy TEXT,
    model TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT,
    actual REAL,
    brier REAL
);

-- Prevent double-resolution of predictions (§53: immutable after resolution)
CREATE TRIGGER IF NOT EXISTS predictions_no_rewrite
BEFORE UPDATE ON predictions
WHEN OLD.resolved_at IS NOT NULL AND NEW.resolved_at IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'prediction already resolved and immutable');
END;

CREATE TABLE IF NOT EXISTS market_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    symbol TEXT NOT NULL,
    ts TEXT NOT NULL,
    price REAL NOT NULL,
    volume REAL,
    meta_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_market_symbol_ts ON market_data(symbol, ts);

CREATE TABLE IF NOT EXISTS paper_orders (
    id TEXT PRIMARY KEY,
    agent_id TEXT,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('buy','sell')),
    qty REAL NOT NULL CHECK (qty > 0),
    price REAL NOT NULL,
    fee_bps REAL NOT NULL,
    slippage_bps REAL NOT NULL,
    notional_minor INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'filled',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL DEFAULT (datetime('now')),
    type TEXT NOT NULL,
    payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_event_type ON event_log(type);

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL DEFAULT (datetime('now')),
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    detail_json TEXT NOT NULL DEFAULT '{}',
    prev_hash TEXT,
    hash TEXT
);

-- Append-only enforcement for audit (§114)
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;

CREATE TABLE IF NOT EXISTS decisions (
    id TEXT PRIMARY KEY,
    agent_id TEXT,
    context_json TEXT NOT NULL DEFAULT '{}',
    options_json TEXT NOT NULL DEFAULT '[]',
    selected TEXT NOT NULL,
    expected_value REAL,
    risk REAL,
    confidence REAL,
    policy_result TEXT,
    authorization TEXT,
    outcome TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
