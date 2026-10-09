-- Migration 003: Sources & Documents
-- Tables: sources, documents (processing tracking)

-- ============================
-- Sources
-- ============================
CREATE TABLE IF NOT EXISTS sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL,          -- 'file', 'url', 'mcp', 'api', 'paste'
    url TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================
-- Documents
-- ============================
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
    filename TEXT,
    content_type TEXT,
    status TEXT NOT NULL DEFAULT 'queued',
    chunks_created INT DEFAULT 0,
    entities_found INT DEFAULT 0,
    relationships_found INT DEFAULT 0,
    error_message TEXT,
    job_id TEXT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Link chunks to documents
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES documents(id) ON DELETE SET NULL;
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES sources(id) ON DELETE SET NULL;
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS chunk_index INT DEFAULT 0;

-- ============================
-- Indexes
-- ============================
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents (status);
CREATE INDEX IF NOT EXISTS idx_documents_source ON documents (source_id);
CREATE INDEX IF NOT EXISTS idx_documents_job ON documents (job_id);
CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks (document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks (source_id);
