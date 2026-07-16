import { supabase } from "../lib/db";
import { cloneRepo, getDefaultBranch } from "../services/clone-service";
import { synchronizeCommits } from "../services/sync-engine";
import { fetchGithubCommitCount } from "../services/github-service";
import { queueAnalyticsGeneration } from "../services/analytics-pipeline";

let isRunning = false;
let workerInterval: NodeJS.Timeout | null = null;
const WORKER_INTERVAL_MS = 1000; // Poll every 1 second

export function startPipelineWorker() {
  if (workerInterval) return;
  
  console.log("[pipeline-worker] Starting background pipeline worker...");
  
  workerInterval = setInterval(async () => {
    if (isRunning) return;
    isRunning = true;
    
    try {
      // Find a queued repository
      const { data: repo, error: fetchErr } = await supabase
        .from("repositories")
        .select("id, github_url")
        .eq("status", "queued")
        .limit(1)
        .maybeSingle();
        
      if (fetchErr) {
        console.error("[pipeline-worker] Error fetching job:", fetchErr);
        return;
      }
      
      if (repo) {
        console.log(`[pipeline-worker] Picked up job for repo: ${repo.id}`);
        await runPipeline(repo.id, repo.github_url);
      }
    } catch (err) {
      console.error("[pipeline-worker] Unexpected error in worker loop:", err);
    } finally {
      isRunning = false;
    }
  }, WORKER_INTERVAL_MS);
}

async function runPipeline(repoId: string, url: string, githubToken?: string) {
  const tPipelineStart = performance.now();
  let runId: string | undefined;

  const updateStatus = async (status: string, error_message: string | null = null, extra: any = {}) => {
    console.log(`[pipeline-worker] STATE_TRANSITION: Repo ${repoId} -> ${status}`);
    const { error } = await supabase.from("repositories").update({ status, error_message, ...extra }).eq("id", repoId);
    if (error) {
      console.error(`[pipeline-worker] FATAL DB ERROR: Failed to transition repo ${repoId} to state ${status}:`, error);
      throw new Error(`Database error on status update to ${status}: ${error.message}`);
    }
  };

  try {
    // Phase 0: pending
    await updateStatus("pending");

    const { data: run } = await supabase
      .from("repository_pipeline_runs")
      .insert({ repo_id: repoId, status: "in_progress" })
      .select("id")
      .maybeSingle();
    if (run) runId = run.id;

    // Stage 1: cloning
    await updateStatus("cloning");
    const tCloneStart = performance.now();
    const targetDir = await cloneRepo(url, githubToken);
    const durationClone = Math.round(performance.now() - tCloneStart);

    // Stage 2: fetching_commits
    await updateStatus("fetching_commits");
    const [totalCommits, defaultBranch] = await Promise.all([
      fetchGithubCommitCount(url, githubToken).catch(e => 0),
      getDefaultBranch(targetDir)
    ]);
    await supabase.from("repositories").update({ total_commits: totalCommits, default_branch: defaultBranch }).eq("id", repoId);

    // Stage 3: indexing (store commits)
    await updateStatus("indexing");
    const tIndexStart = performance.now();
    const { latestSha } = await synchronizeCommits(repoId, targetDir, async (insertedCount, currentLatestSha) => {
      const { count } = await supabase.from("commits").select("*", { count: "exact", head: true }).eq("repo_id", repoId);
      const currentTotal = count || 0;
      const progress = totalCommits > 0 ? Math.min(Math.round((currentTotal / totalCommits) * 100 * 10) / 10, 100) : 100;
      
      await updateStatus("indexing", null, {
        indexed_commits: currentTotal,
        last_indexed_sha: currentLatestSha,
        indexing_progress: progress,
        last_indexed_at: new Date().toISOString()
      });
    });
    const durationIndex = Math.round(performance.now() - tIndexStart);

    // Stage 4: verifying
    await updateStatus("verifying");
    const { count: finalCount } = await supabase.from("commits").select("*", { count: "exact", head: true }).eq("repo_id", repoId);
    const actualCount = finalCount || 0;
    const finalProgress = totalCommits > 0 ? Math.min(Math.round((actualCount / Math.max(actualCount, totalCommits)) * 100 * 10) / 10, 100) : 100;
    await updateStatus("verifying", null, {
      indexed_commits: actualCount,
      indexing_progress: finalProgress,
      last_indexed_at: new Date().toISOString(),
      ...(latestSha ? { last_indexed_sha: latestSha } : {})
    });
    
    // Fire-and-forget verification (as in the original code, but we update status)
    const { runAsyncVerification } = require("../services/sync-engine");
    await runAsyncVerification(repoId, targetDir, totalCommits, runId, tPipelineStart).catch(() => {});

    // Stage 5: analytics
    await updateStatus("analytics");
    const shaToUse = latestSha || "unknown";
    await queueAnalyticsGeneration(repoId, ["contributors", "activity", "evolution"], shaToUse);
    await waitForAnalytics(repoId, ["contributors", "activity", "evolution"]);

    // Stage 6: ai_generation
    await updateStatus("ai_generation");
    
    // Stage 7: journey
    await updateStatus("journey");
    await queueAnalyticsGeneration(repoId, ["journey"], shaToUse);
    await waitForAnalytics(repoId, ["journey"]);

    // Stage 8: ready
    await updateStatus("ready");

    if (runId) {
      await supabase.from("repository_pipeline_runs").update({
        clone_duration_ms: durationClone,
        index_duration_ms: durationIndex,
        status: "completed",
        completed_at: new Date().toISOString()
      }).eq("id", runId);
    }
    
    console.log(`[pipeline-worker] Pipeline complete for ${repoId}`);

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[pipeline-worker] Pipeline failed for ${repoId}:`, err);
    await updateStatus("failed", errorMessage);
    
    if (runId) {
      await supabase.from("repository_pipeline_runs").update({
        status: "failed",
        error_message: errorMessage,
        completed_at: new Date().toISOString()
      }).eq("id", runId);
    }
  }
}

async function waitForAnalytics(repoId: string, types: string[]) {
  // Wait up to 5 minutes for analytics to finish
  let attempts = 0;
  while (attempts < 60) {
    const { data } = await supabase.from("repository_analytics")
      .select("status")
      .eq("repo_id", repoId)
      .in("analytics_type", types);
      
    if (!data || data.length === 0) break;
    const allDone = data.every(a => a.status === "completed" || a.status === "error");
    if (allDone) break;
    
    await new Promise(r => setTimeout(r, 5000));
    attempts++;
  }
}
