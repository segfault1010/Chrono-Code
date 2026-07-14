-- 010_repository_analytics.sql

CREATE TABLE IF NOT EXISTS repository_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  analytics_type text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_commit_sha text,
  analytics_version int NOT NULL DEFAULT 1,
  generated_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'queued',
  error_message text,
  UNIQUE(repo_id, analytics_type)
);

-- Index for the worker to quickly find queued jobs
CREATE INDEX IF NOT EXISTS idx_repository_analytics_status ON repository_analytics(status);
