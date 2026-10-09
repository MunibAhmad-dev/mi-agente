-- Live trading (spec §48-49, §66, §71, §80, §128): real exchange execution
-- with testnet-first rollout and a mandatory human approval gate.

CREATE TABLE IF NOT EXISTS live_orders (
    id TEXT PRIMARY KEY,                     -- lvo_xxx
    client_order_id TEXT NOT NULL UNIQUE,    -- idempotency key (§66); sent as clientOrderId
    agent_id TEXT,
    venue TEXT NOT NULL,                     -- 'binance-testnet' | 'binance' | ...
    symbol TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('buy','sell')),
    qty REAL NOT NULL,
    approval_id TEXT NOT NULL,               -- §71: no order without an APPROVED approval
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','FILLED','REJECTED','AMBIGUOUS','MISMATCH')),
    exchange_order_id TEXT,
    fill_price REAL,
    fill_qty REAL,
    fee_paid REAL,
    notional_minor INTEGER,                  -- our computed quote amount (§80 internal)
    external_ref TEXT,                       -- 'venue:exchange_order_id' for §80 linking
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_live_orders_status ON live_orders (status);
CREATE INDEX IF NOT EXISTS idx_live_orders_agent ON live_orders (agent_id);
