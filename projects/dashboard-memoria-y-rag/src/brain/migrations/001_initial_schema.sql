-- Migration 001: Initial Schema
-- Core tables: memory_spaces, chunks (memories), api_tokens

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================
-- Memory Spaces
-- ============================
CREATE TABLE IF NOT EXISTS memory_spaces (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    color TEXT DEFAULT '#6366f1',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Default space
INSERT INTO memory_spaces (name, description, color)
VALUES ('default', 'Default memory space', '#6366f1')
ON CONFLICT (name) DO NOTHING;

-- ============================
-- Chunks (Memories)
-- ============================
CREATE TABLE IF NOT EXISTS chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id INT NOT NULL REFERENCES memory_spaces(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding vector(384),
    metadata JSONB DEFAULT '{}',
    content_hash TEXT,
    state TEXT NOT NULL DEFAULT 'extracted',
    category TEXT DEFAULT 'fact',
    importance FLOAT DEFAULT 0.5,
    source_id UUID,
    document_id UUID,
    source_name TEXT,
    source_type TEXT,
    forgotten BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================
-- API Tokens
-- ============================
CREATE TABLE IF NOT EXISTS api_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    scopes JSONB DEFAULT '["read","write"]',
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================
-- Indexes for Chunks
-- ============================
-- HNSW vector similarity index
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw
    ON chunks USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_chunks_content_fts
    ON chunks USING gin (to_tsvector('english', content));

-- Trigram index for fuzzy search
CREATE INDEX IF NOT EXISTS idx_chunks_content_trgm
    ON chunks USING gin (content gin_trgm_ops);

-- Space filter index
CREATE INDEX IF NOT EXISTS idx_chunks_space_id
    ON chunks (space_id);

-- Forgotten filter index
CREATE INDEX IF NOT EXISTS idx_chunks_forgotten
    ON chunks (forgotten);

-- Content hash for deduplication
CREATE INDEX IF NOT EXISTS idx_chunks_content_hash
    ON chunks (content_hash);

-- Composite: space + forgotten + state
CREATE INDEX IF NOT EXISTS idx_chunks_space_forgotten_state
    ON chunks (space_id, forgotten, state);

-- ============================
-- Indexes for API Tokens
-- ============================
CREATE INDEX IF NOT EXISTS idx_api_tokens_hash
    ON api_tokens (token_hash);
