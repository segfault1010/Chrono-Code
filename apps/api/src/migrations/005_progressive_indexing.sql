-- ============================================================================
-- Chronocode — Progressive Indexing Migration
-- Adds columns and updates constraints for progressive repository indexing.
-- ============================================================================

-- Add columns for progressive indexing tracking
ALTER TABLE repositories
  ADD COLUMN IF NOT EXISTS last_indexed_sha text,
  ADD COLUMN IF NOT EXISTS indexing_progress real NOT NULL DEFAULT 0;

-- Update status CHECK constraint to include 'indexing_history'
ALTER TABLE repositories
  DROP CONSTRAINT IF EXISTS repositories_status_check;

ALTER TABLE repositories
  ADD CONSTRAINT repositories_status_check
    CHECK (status IN ('queued', 'cloning', 'indexing', 'indexing_history', 'ready', 'failed'));
