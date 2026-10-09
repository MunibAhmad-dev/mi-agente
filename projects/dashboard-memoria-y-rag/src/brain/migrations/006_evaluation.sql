-- Migration 006: Evaluation Framework

-- ============================
-- Evaluation Datasets
-- ============================
CREATE TABLE IF NOT EXISTS eval_datasets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    version TEXT DEFAULT '1.0',
    question_count INT DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================
-- Evaluation Questions
-- ============================
CREATE TABLE IF NOT EXISTS eval_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id UUID NOT NULL REFERENCES eval_datasets(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    expected_answer TEXT DEFAULT '',
    expected_sources JSONB DEFAULT '[]',
    expected_entities JSONB DEFAULT '[]',
    category TEXT DEFAULT 'general',
    difficulty TEXT DEFAULT 'medium',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================
-- Evaluation Runs
-- ============================
CREATE TABLE IF NOT EXISTS eval_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id UUID NOT NULL REFERENCES eval_datasets(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    total_questions INT DEFAULT 0,
    completed_questions INT DEFAULT 0,
    scores JSONB DEFAULT '{}',
    latency_ms FLOAT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================
-- Evaluation Results
-- ============================
CREATE TABLE IF NOT EXISTS eval_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES eval_questions(id) ON DELETE CASCADE,
    answer TEXT DEFAULT '',
    sources JSONB DEFAULT '[]',
    entities JSONB DEFAULT '[]',
    faithfulness FLOAT,
    relevance FLOAT,
    citation_accuracy FLOAT,
    latency_ms FLOAT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================
-- Indexes
-- ============================
CREATE INDEX IF NOT EXISTS idx_eval_questions_dataset ON eval_questions (dataset_id);
CREATE INDEX IF NOT EXISTS idx_eval_runs_dataset ON eval_runs (dataset_id);
CREATE INDEX IF NOT EXISTS idx_eval_runs_status ON eval_runs (status);
CREATE INDEX IF NOT EXISTS idx_eval_results_run ON eval_results (run_id);
