import { PipelineStageId, PIPELINE_GRAPH, PipelineState } from "@chronocode/shared-types";
import { supabase } from "../lib/db";

export async function computePipelineState(repoId: string, currentStatus: string, commitsProgress: number, totalCommits: number): Promise<PipelineState> {
  const completedStages: PipelineStageId[] = [];
  const runningStages: PipelineStageId[] = [];
  const pendingStages: PipelineStageId[] = [];
  
  // Pipeline State is now purely for indexing progress.
  // AI/Analytics feature states are tracked independently and do not block repository readiness.
  
  let overallProgress = 0;
  
  // 1. Initial Stages (clone, fetch, indexing)
  // These are strictly linear based on repo.status
  if (currentStatus === "ready" || (currentStatus === "failed" && commitsProgress >= 100)) {
    completedStages.push("clone", "fetch", "indexing", "ready");
    overallProgress = 100;
  } else if (currentStatus === "indexing" || currentStatus === "indexing_history" || (currentStatus === "failed" && commitsProgress > 0)) {
    completedStages.push("clone", "fetch");
    if (currentStatus !== "failed") runningStages.push("indexing");
    overallProgress += PIPELINE_GRAPH.clone.weight;
    overallProgress += PIPELINE_GRAPH.fetch.weight;
    overallProgress += PIPELINE_GRAPH.indexing.weight * (Math.min(commitsProgress, 100) / 100);
  } else if (currentStatus === "fetching_commits" || (currentStatus === "failed" && commitsProgress === 0)) {
    completedStages.push("clone");
    if (currentStatus !== "failed") runningStages.push("fetch");
    overallProgress += PIPELINE_GRAPH.clone.weight;
  } else if (currentStatus === "cloning") {
    runningStages.push("clone");
  } else {
    pendingStages.push("clone", "fetch", "indexing", "ready");
  }

  // To not break frontend UI expecting AI stages in the list, we append them as pending/completed
  // But they do not block overallProgress from reaching 100 for the index pipeline.
  // Actually, we can just leave them out of running/pending, but PIPELINE_GRAPH contains them.
  const aiStages: PipelineStageId[] = ["journey", "analytics", "story", "risk"];
  if (currentStatus === "ready") {
    // We don't really know their status here, so we won't add them. Frontend has independent polling.
  }

  // Normalize progress relative to only the indexing stages (10 + 10 + 40 = 60 weight total)
  // So a 60 weight = 100% of pipeline state.
  const INDEXING_TOTAL_WEIGHT = PIPELINE_GRAPH.clone.weight + PIPELINE_GRAPH.fetch.weight + PIPELINE_GRAPH.indexing.weight;
  let normalizedProgress = (overallProgress / INDEXING_TOTAL_WEIGHT) * 100;
  if (currentStatus === "ready") {
    normalizedProgress = 100;
  }
  normalizedProgress = Math.min(Math.round(normalizedProgress), 100);

  let estimated_activity = "Initializing analysis...";
  
  if (currentStatus === "ready") {
    runningStages.length = 0;
    pendingStages.length = 0;
    estimated_activity = "Indexing complete";
  } else if (runningStages.length > 0) {
    estimated_activity = PIPELINE_GRAPH[runningStages[0]!].label + "...";
  }

  const pipelineState: PipelineState = {
    overall_progress: normalizedProgress,
    completed_stages: completedStages,
    running_stages: runningStages,
    pending_stages: pendingStages,
    estimated_activity
  };

  // Update repository pipeline state
  await supabase
    .from("repositories")
    .update({ pipeline_state: pipelineState })
    .eq("id", repoId);
    
  return pipelineState;
}
