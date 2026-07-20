// ============================================================================
// Chronocode — Domain Models
// Maps 1:1 with the Supabase Postgres schema defined in AGENT.md.
// ============================================================================

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export type RepositoryStatus =
  | "queued"
  | "pending"
  | "cloning"
  | "fetching_commits"
  | "indexing"
  | "indexing_history"
  | "verifying"
  | "analytics"
  | "ai_generation"
  | "journey"
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
  last_indexed_sha: string | null;
  indexing_progress: number;       // 0-100 percentage
  error_message: string | null;
  verification_status: "pending" | "passed" | "failed" | "warning";
  verification_reason: string | null;
  created_at: string; // ISO-8601
  updated_at: string; // ISO-8601
  last_indexed_at: string | null; // ISO-8601
  pipeline_state?: any; // JSONB PipelineState
}

// ---------------------------------------------------------------------------
// Pipeline Run
// ---------------------------------------------------------------------------

export interface PipelineRun {
  id: string;
  repo_id: string;
  started_at: string; // ISO-8601
  completed_at: string | null; // ISO-8601
  clone_duration_ms: number | null;
  index_duration_ms: number | null;
  db_write_duration_ms: number | null;
  verification_duration_ms: number | null;
  analytics_queue_duration_ms: number | null;
  total_duration_ms: number | null;
  status: "in_progress" | "completed" | "failed";
  error_message: string | null;
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

// ---------------------------------------------------------------------------
// Repository Journey (Macro Evolution)
// ---------------------------------------------------------------------------

export type MilestoneCategory = "feature" | "bugfix" | "refactor" | "release" | "architecture" | "docs" | "chore" | "unknown";

export interface JourneyMilestone {
  sha: string;
  message: string;
  author_name: string;
  authored_at: string;
  category: MilestoneCategory;
  impact_score: number; // 1-10
  is_merge: boolean;
  insertions?: number;
  deletions?: number;
  files_changed?: number;
}

export interface JourneyActivityNode {
  date: string; // YYYY-MM
  count: number;
}

export interface JourneyPhase {
  name: string; // e.g., "Initial Development", "Rapid Growth", "Stabilization"
  start_date: string; // YYYY-MM
  end_date: string; // YYYY-MM
  color: string;
}

export interface JourneyStats {
  total_milestones: number;
  repository_age_days: number;
  most_active_month: string;
  most_active_month_count: number;
  largest_commit_sha: string | null;
  releases_count: number;
  major_features_count: number;
  refactors_count: number;
  // New deterministic metrics
  total_commits: number;
  contributors_count: number;
  most_active_year: string;
  largest_refactor_sha: string | null;
  longest_inactive_period_days: number;
  average_commit_size: number; // Insertions + Deletions
  repository_health_score: number; // 0-100
  development_velocity: number; // Avg commits per month
}

export interface RepositoryJourney {
  milestones: JourneyMilestone[];
  activity: JourneyActivityNode[];
  phases: JourneyPhase[];
  stats: JourneyStats;

  _meta?: {
    status: "pending" | "queued" | "computing" | "ready" | "failed" | "outdated";
    generated_at?: string;
    analytics_version?: string;
    error_message?: string;
  };
}

export interface JourneyInsights {
  status: "generating" | "completed" | "error";
  analyzed_commit_sha: string;
  updated_at?: string;
  ai_summary?: string;
  health_indicators?: {
    label: string;
    value: string;
    status: "good" | "warning" | "neutral";
  }[];
}

export interface RepositoryComparison {
  id: string;
  repo1_id: string;
  repo2_id: string;
  ai_summary: string | null;
  error_message?: string | null;
  status: 'queued' | 'generating' | 'completed' | 'error';
  created_at: string;
  updated_at: string;
}
