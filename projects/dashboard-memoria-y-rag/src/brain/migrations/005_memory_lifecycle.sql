-- Migration 005: Memory Lifecycle
-- Extended state tracking for memory promotion

-- ============================
-- Memory States History
-- ============================
CREATE TABLE IF NOT EXISTS memory_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chunk_id UUID NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
    state TEXT NOT NULL,
    reason TEXT DEFAULT '',
    created_by TEXT DEFAULT 'system',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================
-- Add lifecycle columns to chunks
-- ============================
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS source_count INT DEFAULT 1;
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMPTZ;
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS last_conflict_at TIMESTAMPTZ;
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- ============================
-- Indexes
-- ============================
CREATE INDEX IF NOT EXISTS idx_memory_states_chunk ON memory_states (chunk_id);
CREATE INDEX IF NOT EXISTS idx_memory_states_state ON memory_states (state);
CREATE INDEX IF NOT EXISTS idx_chunks_state ON chunks (state);
CREATE INDEX IF NOT EXISTS idx_chunks_importance ON chunks (importance DESC);
