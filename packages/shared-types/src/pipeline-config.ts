// ============================================================================
// Chronocode — Pipeline Configuration
// Defines the dependency graph and weights for repository analysis stages.
// ============================================================================

export type PipelineStageId = 
  | "clone"
  | "fetch"
  | "indexing"
  | "journey"
  | "analytics"
  | "story"
  | "risk"
  | "ready";

export interface PipelineStageConfig {
  id: PipelineStageId;
  label: string;
  weight: number;      // Percentage (0-100), total should ideally equal 100
  dependsOn: PipelineStageId[]; // Must complete before this stage starts
  canRunParallel: boolean;
}

export const PIPELINE_GRAPH: Record<PipelineStageId, PipelineStageConfig> = {
  clone: {
    id: "clone",
    label: "Cloning repository",
    weight: 10,
    dependsOn: [],
    canRunParallel: false,
  },
  fetch: {
    id: "fetch",
    label: "Discovering commit history",
    weight: 10,
    dependsOn: ["clone"],
    canRunParallel: false,
  },
  indexing: {
    id: "indexing",
    label: "Processing commits",
    weight: 40,
    dependsOn: ["fetch"],
    canRunParallel: false,
  },
  journey: {
    id: "journey",
    label: "Building repository journey",
    weight: 10,
    dependsOn: ["indexing"],
    canRunParallel: true,
  },
  analytics: {
    id: "analytics",
    label: "Analyzing contributor patterns",
    weight: 10,
    dependsOn: ["indexing"],
    canRunParallel: true,
  },
  story: {
    id: "story",
    label: "Generating Repository Story",
    weight: 10,
    dependsOn: ["journey", "analytics"], // Story needs journey and analytics
    canRunParallel: true,
  },
  risk: {
    id: "risk",
    label: "Analyzing architectural risk",
    weight: 10,
    dependsOn: ["indexing"],
    canRunParallel: true,
  },
  ready: {
    id: "ready",
    label: "Analysis complete",
    weight: 0,
    dependsOn: ["clone", "fetch", "indexing", "journey", "analytics", "story", "risk"],
    canRunParallel: false,
  }
};

export interface PipelineState {
  overall_progress: number;
  completed_stages: PipelineStageId[];
  running_stages: PipelineStageId[];
  pending_stages: PipelineStageId[];
  estimated_activity: string | null;
  timings?: Record<string, number>;
}
