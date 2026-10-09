-- Migration 004: Query Log & RAG Config

-- ============================
-- Query Log
-- ============================
CREATE TABLE IF NOT EXISTS query_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id TEXT,
    query TEXT NOT NULL,
    variations JSONB DEFAULT '[]',
    result_count INT DEFAULT 0,
    top_similarity FLOAT,
    latency_ms FLOAT,
    reranker_used BOOLEAN DEFAULT FALSE,
    chunks_retrieved JSONB DEFAULT '[]',
    response_preview TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================
-- RAG Config
-- ============================
CREATE TABLE IF NOT EXISTS rag_config (
    id SERIAL PRIMARY KEY,
    config_key TEXT NOT NULL UNIQUE,
    config_value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Default config
INSERT INTO rag_config (config_key, config_value) VALUES
    ('search_weights', '{"vector": 1.0, "fts": 0.5, "importance": 0.15, "recency": 0.05, "rrf_k": 60}'),
    ('context', '{"max_tokens": 6000, "max_history": 10, "max_chunks": 10}'),
    ('reranker', '{"enabled": true, "model": "cross-encoder/ms-marco-MiniLM-L-6-v2"}')
ON CONFLICT (config_key) DO NOTHING;

-- ============================
-- Indexes
-- ============================
CREATE INDEX IF NOT EXISTS idx_query_log_created ON query_log (created_at);
CREATE INDEX IF NOT EXISTS idx_query_log_request ON query_log (request_id);
