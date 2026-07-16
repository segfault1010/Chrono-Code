-- Migration to extend the repositories_status_check constraint
-- Adds fine-grained statuses used by the pipeline worker

ALTER TABLE repositories
  DROP CONSTRAINT IF EXISTS repositories_status_check;

ALTER TABLE repositories
  ADD CONSTRAINT repositories_status_check
    CHECK (status IN (
      'queued', 
      'pending', 
      'cloning', 
      'fetching_commits',
      'indexing', 
      'indexing_history', 
      'verifying', 
      'analytics', 
      'ai_generation', 
      'journey', 
      'ready', 
      'failed'
    ));
