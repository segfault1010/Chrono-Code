// ============================================================================
// Chronocode — Shared Types
// Barrel export for @chronocode/shared-types
// ============================================================================

// Domain models
export type {
  Repository,
  RepositoryStatus,
  PipelineRun,
  Commit,
  CommitExplanation,
  CommitFile,
  FileChangeType,
  JourneyMilestone,
  JourneyActivityNode,
  JourneyPhase,
  JourneyStats,
  RepositoryJourney,
  JourneyInsights,
  MilestoneCategory,
  RepositoryComparison,
} from "./models";

export type {
  PipelineStageId,
  PipelineStageConfig,
  PipelineState,
} from "./pipeline-config";

export { PIPELINE_GRAPH } from "./pipeline-config";

// API contracts
export type {
  CreateRepoRequest,
  CreateRepoResponse,
  GetRepoResponse,
  GetCommitsResponse,
  CommitListItem,
  PaginationMeta,
  ExplainCommitParams,
  ExplainCommitResponse,
  ApiErrorResponse,
} from "./api";
