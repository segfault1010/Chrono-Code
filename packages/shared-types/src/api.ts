// ============================================================================
// Chronocode — API Request/Response Types
// Shared between frontend and backend to ensure type-safe API communication.
// ============================================================================

import type {
  Repository,
  Commit,
  CommitExplanation,
} from "./models";

// ---------------------------------------------------------------------------
// POST /api/repos
// ---------------------------------------------------------------------------

export interface CreateRepoRequest {
  url: string;
}

export type CreateRepoResponse = Repository;

// ---------------------------------------------------------------------------
// GET /api/repos/:id
// ---------------------------------------------------------------------------

export type GetRepoResponse = Repository;

// ---------------------------------------------------------------------------
// GET /api/repos/:id/commits
// ---------------------------------------------------------------------------

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

/** Commit as returned in list endpoints — includes a flag for whether an explanation exists. */
export interface CommitListItem extends Omit<Commit, "repo_id" | "created_at"> {
  has_explanation: boolean;
}

export interface GetCommitsResponse {
  data: CommitListItem[];
  pagination: PaginationMeta;
}

// ---------------------------------------------------------------------------
// GET /api/commits/:sha/explain
// ---------------------------------------------------------------------------

export interface ExplainCommitParams {
  repoId: string;
}

export interface ExplainCommitResponse {
  sha: string;
  explanation: string;
  cached: boolean;
  model_id: string;
  created_at: string; // ISO-8601
}

// ---------------------------------------------------------------------------
// Error responses
// ---------------------------------------------------------------------------

export interface ApiErrorResponse {
  error: string;
  details?: string;
}
