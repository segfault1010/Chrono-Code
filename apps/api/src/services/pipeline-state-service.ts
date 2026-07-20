import { PipelineStageId, PIPELINE_GRAPH, PipelineState } from "@chronocode/shared-types";
import { supabase } from "../lib/db";

export async function computePipelineState(repoId: string, currentStatus: string, commitsProgress: number, totalCommits: number): Promise<PipelineState> {
  const completedStages: PipelineStageId[] = [];
  const runningStages: PipelineStageId[] = [];
  const pendingStages: PipelineStageId[] = [];
  
  // Helper to safely transition
  let overallProgress = 0;
  
  // 1. Initial Stages (clone, fetch, indexing)
  // These are strictly linear based on repo.status
  if (["ready", "analytics", "journey", "verifying"].includes(currentStatus) || (currentStatus === "failed" && commitsProgress >= 100)) {
    completedStages.push("clone", "fetch", "indexing");
    overallProgress += PIPELINE_GRAPH.clone.weight;
    overallProgress += PIPELINE_GRAPH.fetch.weight;
    overallProgress += PIPELINE_GRAPH.indexing.weight;
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
    pendingStages.push("clone", "fetch", "indexing");
  }

  // 2. Parallel AI Stages (analytics, journey, story, risk)
  // These are queried dynamically
  if (["analytics", "verifying", "journey", "ready"].includes(currentStatus) || (currentStatus === "failed" && commitsProgress >= 100)) {
    const { data: analyticsTasks } = await supabase
      .from("repository_analytics")
      .select("analytics_type, status")
      .eq("repo_id", repoId);
      
    const taskMap = new Map((analyticsTasks || []).map(t => [t.analytics_type, t.status]));
    
    // Journey
    const journeyStatus = taskMap.get("journey");
    if (journeyStatus === "completed") {
      completedStages.push("journey");
      overallProgress += PIPELINE_GRAPH.journey.weight;
    } else if ((journeyStatus === "pending" || journeyStatus === "computing") && currentStatus !== "failed") {
      runningStages.push("journey");
    } else {
      pendingStages.push("journey");
    }

    // Analytics (Contributors/Evolution/Activity)
    const analyticsReady = ["contributors", "evolution", "activity"].every(t => taskMap.get(t) === "completed");
    const analyticsRunning = ["contributors", "evolution", "activity"].some(t => taskMap.get(t) === "pending" || taskMap.get(t) === "computing");
    
    if (analyticsReady) {
      completedStages.push("analytics");
      overallProgress += PIPELINE_GRAPH.analytics.weight;
    } else if (analyticsRunning && currentStatus !== "failed") {
      runningStages.push("analytics");
    } else {
      pendingStages.push("analytics");
    }
  } else {
    pendingStages.push("journey", "analytics");
  }
  
  // Story (Insights)
  const { data: insights } = await supabase
    .from("repository_insights")
    .select("status")
    .eq("repo_id", repoId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (insights?.status === "completed") {
    completedStages.push("story");
    overallProgress += PIPELINE_GRAPH.story.weight;
  } else if (insights?.status === "generating" && currentStatus !== "failed") {
    runningStages.push("story");
  } else {
    pendingStages.push("story");
  }

  // Risk (If exists, else defer)
  pendingStages.push("risk"); // Risk deferred by default for now unless we implement background tracking for it

  if (currentStatus === "ready" && completedStages.includes("story") && completedStages.includes("journey") && completedStages.includes("analytics")) {
    completedStages.push("ready");
  } else if (!completedStages.includes("ready")) {
    pendingStages.push("ready");
  }
  
  // Make sure we never exceed 100
  overallProgress = Math.min(Math.round(overallProgress), 100);

  let estimated_activity = "Initializing analysis...";
  
  if (completedStages.includes("ready") || currentStatus === "ready") {
    // If the pipeline is ready, enforce a clean terminal state
    overallProgress = 100;
    runningStages.length = 0; // Clear running stages
    pendingStages.length = 0; // Clear pending stages
    // Ensure all required stages are marked completed
    const allStages = Object.keys(PIPELINE_GRAPH) as PipelineStageId[];
    for (const s of allStages) {
      if (!completedStages.includes(s)) completedStages.push(s);
    }
    estimated_activity = "Analysis complete";
  } else if (runningStages.length > 0) {
    estimated_activity = PIPELINE_GRAPH[runningStages[0]!].label + "...";
  }

  const pipelineState: PipelineState = {
    overall_progress: overallProgress,
    completed_stages: completedStages,
    running_stages: runningStages,
    pending_stages: pendingStages,
    estimated_activity
  };

  // Update repository
  await supabase
    .from("repositories")
    .update({ pipeline_state: pipelineState })
    .eq("id", repoId);
    
  return pipelineState;
}
