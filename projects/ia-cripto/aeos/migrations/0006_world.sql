-- Phase 5 (spec §24-31, §75): World Brain store, entities, sources, opportunities.

CREATE TABLE IF NOT EXISTS world_observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,                    -- feed/site/api identifier
    source_url TEXT NOT NULL DEFAULT '',
    external_id TEXT,                        -- provider's id for dedup
    content_hash TEXT NOT NULL,              -- normalized-content hash (dedup, §75)
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'news',       -- news|review|forum|pricing|release|regulation
    observed_at TEXT NOT NULL,               -- event time (when it happened)
    ingested_at TEXT NOT NULL DEFAULT (datetime('now')),
    valid_from TEXT NOT NULL DEFAULT (datetime('now')),
    valid_until TEXT,                        -- temporal memory (§26): never overwrite
    meta_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_obs_hash ON world_observations(content_hash);
CREATE INDEX IF NOT EXISTS idx_obs_kind_time ON world_observations(kind, observed_at);

CREATE TABLE IF NOT EXISTS world_entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    canonical_name TEXT NOT NULL,
    aliases_json TEXT NOT NULL DEFAULT '[]',
    entity_type TEXT NOT NULL DEFAULT 'topic',  -- product|company|topic|technology
    confidence REAL NOT NULL DEFAULT 0.5,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS observation_entities (
    observation_id INTEGER NOT NULL REFERENCES world_observations(id),
    entity_id INTEGER NOT NULL REFERENCES world_entities(id),
    PRIMARY KEY (observation_id, entity_id)
);

CREATE TABLE IF NOT EXISTS source_trust (
    source TEXT PRIMARY KEY,
    reliability REAL NOT NULL DEFAULT 0.5,      -- 0..1, updated from outcomes (§28)
    freshness REAL NOT NULL DEFAULT 0.5,
    authority REAL NOT NULL DEFAULT 0.5,
    confirmations INTEGER NOT NULL DEFAULT 0,
    contradictions INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS opportunities (
    id TEXT PRIMARY KEY,
    market TEXT NOT NULL,
    segment TEXT NOT NULL DEFAULT '',
    problem TEXT NOT NULL,
    evidence_json TEXT NOT NULL DEFAULT '[]',   -- observation ids + quotes (§75 provenance)
    demand_score REAL NOT NULL DEFAULT 0.0,
    competition_score REAL NOT NULL DEFAULT 0.0,   -- 0=saturated, 1=open
    margin_score REAL NOT NULL DEFAULT 0.0,
    capital_required_minor INTEGER NOT NULL DEFAULT 0,
    time_to_market_days INTEGER NOT NULL DEFAULT 0,
    risk REAL NOT NULL DEFAULT 0.5,
    uncertainty REAL NOT NULL DEFAULT 0.5,
    information_value REAL NOT NULL DEFAULT 0.0,
    expected_value REAL NOT NULL DEFAULT 0.0,      -- computed by scoring (§31)
    confidence REAL NOT NULL DEFAULT 0.0,
    status TEXT NOT NULL DEFAULT 'DETECTED'
        CHECK (status IN ('DETECTED','SCORING','APPROVED','REJECTED','ACTED','EXPIRED')),
    detected_at TEXT NOT NULL DEFAULT (datetime('now')),
    scored_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_opp_status ON opportunities(status, expected_value);
