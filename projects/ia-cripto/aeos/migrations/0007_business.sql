-- Phase 6 (spec §34-44, §74, §167b-c): products, deployments, marketing,
-- analytics, support.

CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    agent_id TEXT REFERENCES agents(id),
    opportunity_id TEXT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'landing',    -- landing|micro_saas|api|tool
    config_json TEXT NOT NULL DEFAULT '{}',  -- template, copy, pricing
    status TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT','BUILDING','TESTED','SANDBOX_OK','DEPLOYED','FAILED','RETIRED')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deployments (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id),
    provider TEXT NOT NULL,                  -- hosting adapter name
    url TEXT NOT NULL DEFAULT '',
    version INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','DEPLOYING','LIVE','FAILED','ROLLED_BACK')),
    health_ok INTEGER NOT NULL DEFAULT 0,
    deployed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    agent_id TEXT REFERENCES agents(id),
    product_id TEXT NOT NULL REFERENCES products(id),
    channel TEXT NOT NULL,                   -- reddit|x|email|seo|...
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PLANNED'
        CHECK (status IN ('PLANNED','RUNNING','PAUSED','COMPLETED','BLOCKED')),
    spend_minor INTEGER NOT NULL DEFAULT 0,
    policy_checked INTEGER NOT NULL DEFAULT 0,   -- anti-spam governance (§39)
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT NOT NULL REFERENCES products(id),
    anon_user_id TEXT NOT NULL,              -- cookie-less hashed visitor (privacy §32)
    event_type TEXT NOT NULL,                -- visit|signup|purchase|churn
    campaign_id TEXT,
    ts TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ae_product_type ON analytics_events(product_id, event_type);

CREATE TABLE IF NOT EXISTS funnel_daily (
    product_id TEXT NOT NULL,
    day TEXT NOT NULL,
    visits INTEGER NOT NULL DEFAULT 0,
    signups INTEGER NOT NULL DEFAULT 0,
    purchases INTEGER NOT NULL DEFAULT 0,
    revenue_minor INTEGER NOT NULL DEFAULT 0,
    spend_minor INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (product_id, day)
);

CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id),
    anon_user_id TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'question'
        CHECK (category IN ('question','bug','billing','feature','complaint')),
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ANSWERED','CLOSED')),
    sla_due_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
