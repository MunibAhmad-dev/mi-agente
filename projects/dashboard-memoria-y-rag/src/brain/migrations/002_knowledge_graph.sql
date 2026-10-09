-- Migration 002: Knowledge Graph
-- Tables: entities, relationships, entity_mentions

-- ============================
-- Entities
-- ============================
CREATE TABLE IF NOT EXISTS entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    space_id INT REFERENCES memory_spaces(id) ON DELETE SET NULL,
    properties JSONB DEFAULT '{}',
    mention_count INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_unique
    ON entities (lower(name), type, space_id);

-- ============================
-- Entity Mentions
-- ============================
CREATE TABLE IF NOT EXISTS entity_mentions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    chunk_id UUID NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
    start_offset INT NOT NULL,
    end_offset INT NOT NULL,
    context TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================
-- Relationships
-- ============================
CREATE TABLE IF NOT EXISTS relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    target_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'related_to',
    strength FLOAT DEFAULT 1.0,
    chunk_id UUID REFERENCES chunks(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (source_entity_id, target_entity_id, type)
);

-- ============================
-- Indexes
-- ============================
CREATE INDEX IF NOT EXISTS idx_entities_name ON entities (name);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities (type);
CREATE INDEX IF NOT EXISTS idx_entities_space ON entities (space_id);
CREATE INDEX IF NOT EXISTS idx_entity_mentions_entity ON entity_mentions (entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_mentions_chunk ON entity_mentions (chunk_id);
CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships (source_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships (target_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_type ON relationships (type);

-- ============================
-- Graph Visualization Views
-- ============================
CREATE OR REPLACE VIEW live_entities AS
SELECT
    e.id,
    e.name,
    e.type,
    e.space_id,
    e.mention_count,
    e.properties,
    e.created_at,
    COALESCE(space.name, 'default') AS space_name
FROM entities e
LEFT JOIN memory_spaces space ON space.id = e.space_id;

CREATE OR REPLACE VIEW live_relationships AS
SELECT
    r.id,
    r.type,
    r.strength,
    r.source_entity_id,
    r.target_entity_id,
    s.name AS source_name,
    s.type AS source_type,
    t.name AS target_name,
    t.type AS target_type,
    r.chunk_id,
    r.created_at
FROM relationships r
JOIN entities s ON s.id = r.source_entity_id
JOIN entities t ON t.id = r.target_entity_id;
