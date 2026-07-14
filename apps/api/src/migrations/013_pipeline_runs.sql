-- Migration: Create repository_pipeline_runs table for debugging timings

CREATE TABLE repository_pipeline_runs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    repo_id uuid REFERENCES repositories(id) ON DELETE CASCADE,
    started_at timestamptz DEFAULT now(),
    completed_at timestamptz,
    clone_duration_ms integer,
    index_duration_ms integer,
    db_write_duration_ms integer,
    verification_duration_ms integer,
    analytics_queue_duration_ms integer,
    total_duration_ms integer,
    status text CHECK (status IN ('in_progress', 'completed', 'failed')),
    error_message text
);

CREATE INDEX idx_pipeline_runs_repo_id ON repository_pipeline_runs(repo_id);
