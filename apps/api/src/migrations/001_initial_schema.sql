-- ============================================================================
-- Chronocode — Initial Database Schema
-- Run this migration against your Supabase Postgres instance.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- repositories — Tracked GitHub repositories
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS repositories (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  github_url      text        UNIQUE NOT NULL,
  owner           text        NOT NULL,
  name            text        NOT NULL,
  default_branch  text,
  status          text        NOT NULL DEFAULT 'queued'
                              CHECK (status IN ('queued', 'cloning', 'indexing', 'ready', 'failed')),
  total_commits   integer     NOT NULL DEFAULT 0,
  indexed_commits integer     NOT NULL DEFAULT 0,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  last_indexed_at timestamptz
);

-- ---------------------------------------------------------------------------
-- commits — Parsed commit metadata from git log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS commits (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id         uuid        NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  sha             text        NOT NULL,
  message         text        NOT NULL,
  author_name     text        NOT NULL,
  author_email    text,
  authored_at     timestamptz NOT NULL,
  committer_name  text,
  committer_email text,
  committed_at    timestamptz,
  parent_shas     text[]      NOT NULL DEFAULT '{}',
  files_changed   integer     NOT NULL DEFAULT 0,
  insertions      integer     NOT NULL DEFAULT 0,
  deletions       integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (repo_id, sha)
);

-- Index for timeline pagination: newest commits first per repo
CREATE INDEX IF NOT EXISTS idx_commits_repo_authored
  ON commits (repo_id, authored_at DESC);

-- ---------------------------------------------------------------------------
-- commit_explanations — AI-generated explanations, cached by SHA globally
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS commit_explanations (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sha               text        UNIQUE NOT NULL,  -- Global cache key (not per-repo)
  explanation       text        NOT NULL,
  model_id          text        NOT NULL,
  prompt_tokens     integer,
  completion_tokens integer,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- commit_files — Files changed in each commit
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS commit_files (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  commit_id     uuid    NOT NULL REFERENCES commits(id) ON DELETE CASCADE,
  file_path     text    NOT NULL,
  change_type   text    NOT NULL CHECK (change_type IN ('A', 'M', 'D', 'R', 'C')),
  insertions    integer NOT NULL DEFAULT 0,
  deletions     integer NOT NULL DEFAULT 0
);

-- Index for looking up files by commit
CREATE INDEX IF NOT EXISTS idx_commit_files_commit_id
  ON commit_files (commit_id);

-- ---------------------------------------------------------------------------
-- Auto-update updated_at on repositories
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_repositories_updated_at
  BEFORE UPDATE ON repositories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
