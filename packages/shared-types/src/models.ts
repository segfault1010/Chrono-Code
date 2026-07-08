// ============================================================================
// Chronocode — Domain Models
// Maps 1:1 with the Supabase Postgres schema defined in AGENT.md.
// ============================================================================

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export type RepositoryStatus =
  | "queued"
  | "cloning"
  | "indexing"
  | "ready"
  | "failed";

export interface Repository {
  id: string;
  github_url: string;
  owner: string;
  name: string;
  default_branch: string | null;
  status: RepositoryStatus;
  total_commits: number;
  indexed_commits: number;
  error_message: string | null;
  created_at: string; // ISO-8601
  updated_at: string; // ISO-8601
  last_indexed_at: string | null; // ISO-8601
}

// ---------------------------------------------------------------------------
// Commit
// ---------------------------------------------------------------------------

export interface Commit {
  id: string;
  repo_id: string;
  sha: string;
  message: string;
  author_name: string;
  author_email: string | null;
  authored_at: string; // ISO-8601
  committer_name: string | null;
  committer_email: string | null;
  committed_at: string | null; // ISO-8601
  parent_shas: string[];
  files_changed: number;
  insertions: number;
  deletions: number;
  created_at: string; // ISO-8601
}

// ---------------------------------------------------------------------------
// Commit Explanation (AI-generated, cached by SHA globally)
// ---------------------------------------------------------------------------

export interface CommitExplanation {
  id: string;
  sha: string;
  explanation: string;
  model_id: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  created_at: string; // ISO-8601
}

// ---------------------------------------------------------------------------
// Commit File (files changed in a commit)
// ---------------------------------------------------------------------------

export type FileChangeType = "A" | "M" | "D" | "R" | "C";

export interface CommitFile {
  id: string;
  commit_id: string;
  file_path: string;
  change_type: FileChangeType;
  insertions: number;
  deletions: number;
}
