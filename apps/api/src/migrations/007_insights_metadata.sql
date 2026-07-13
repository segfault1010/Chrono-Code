-- 007_insights_metadata.sql
-- Adds generation timestamp and commit snapshot count to repository_insights

ALTER TABLE repository_insights
  ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_commits_at_generation INTEGER;
