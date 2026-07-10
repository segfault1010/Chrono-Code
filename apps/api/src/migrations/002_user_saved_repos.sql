-- ============================================================================
-- Chronocode — V2 User Saved Repositories Migration
-- ============================================================================

CREATE TABLE IF NOT EXISTS saved_repositories (
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  repo_id     uuid        NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, repo_id)
);

-- Enable RLS
ALTER TABLE saved_repositories ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own saved repositories
CREATE POLICY "Users can view their own saved repos"
  ON saved_repositories
  FOR SELECT
  USING (auth.uid() = user_id);

-- Allow users to insert their own saved repositories
CREATE POLICY "Users can save repos"
  ON saved_repositories
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Allow users to delete their own saved repositories
CREATE POLICY "Users can delete their own saved repos"
  ON saved_repositories
  FOR DELETE
  USING (auth.uid() = user_id);
