import { supabase } from "../lib/db";
import { cloneRepo, getDefaultBranch } from "../services/clone-service";
import { synchronizeCommits } from "../services/sync-engine";
import { fetchGithubCommitCount } from "../services/github-service";
import { queueAnalyticsGeneration } from "../services/analytics-pipeline";

let isRunning = false;
let workerInterval: NodeJS.Timeout | null = null;
const WORKER_INTERVAL_MS = 3000; // Poll every 3 seconds

export function startPipelineWorker() {
  console.log("[pipeline-worker] startPipelineWorker() called - checking if interval is set");
  if (workerInterval) {
    console.log("[pipeline-worker] Interval already set, skipping duplicate start.");
    return;
  }
  
  console.log("[pipeline-worker] Starting background pipeline worker...");
  
  workerInterval = setInterval(async () => {
    if (isRunning) {
      return;
    }
    isRunning = true;
    
    try {
      const { data: repo, error: fetchErr } = await supabase
        .from("repositories")
        .select("id, github_url, status")
        .in("status", ["queued", "analytics", "journey"])
        .order("updated_at", { ascending: true })
        .limit(1)
        .maybeSingle();
        
      if (fetchErr) {
        console.error("[pipeline-worker] Error fetching job:", fetchErr);
        return;
      }
      
      if (repo) {
        console.log(`[pipeline-worker] Picked up job for repo: ${repo.id} in state: ${repo.status}`);
        await runPipelineSlice(repo.id, repo.github_url, repo.status);
      }
    } catch (err: any) {
      console.error("[pipeline-worker] Unexpected error in worker loop:");
      console.error(err?.stack || err);
    } finally {
      isRunning = false;
    }
  }, WORKER_INTERVAL_MS);
}

async function checkAnalyticsDone(repoId: string, types: string[]): Promise<boolean> {
  const { data, error } = await supabase.from("repository_analytics")
    .select("status, analytics_type")
    .eq("repo_id", repoId)
    .in("analytics_type", types);
    
  if (error) {
    console.error(`[pipeline-worker] checkAnalyticsDone query error:`, error);
    return false;
  }
    
  if (!data || data.length < types.length) {
    return false;
  }
  
  return data.every(a => a.status === "completed" || a.status === "error");
}

async function getLatestSha(repoId: string) {
  const { data } = await supabase.from("repositories").select("last_indexed_sha").eq("id", repoId).maybeSingle();
  return data?.last_indexed_sha || "unknown";
}

async function runPipelineSlice(repoId: string, url: string, status: string) {
  const tPipelineStart = performance.now();
  
  const updateStatus = async (newStatus: string, error_message: string | null = null, extra: any = {}) => {
    console.log(`[pipeline-worker] Status -> ${newStatus}`);
    const { data, error } = await supabase.from("repositories").update({ 
      status: newStatus, 
      error_message, 
      updated_at: new Date().toISOString(),
      ...extra 
    }).eq("id", repoId).select("*");
    
    if (error) {
      console.error(`[pipeline-worker] FATAL DB ERROR: Failed to transition repo ${repoId} to state ${newStatus}:`, error);
      throw new Error(`Database error on status update to ${newStatus}: ${error.message}`);
    }
  };

  try {
    if (status === "queued") {
      console.log(`[pipeline-worker] Starting synchronous indexing for repo ${repoId}`);
      await updateStatus("pending");

      const { data: run, error: insertError } = await supabase
        .from("repository_pipeline_runs")
        .insert({ repo_id: repoId, status: "in_progress" })
        .select("id")
        .maybeSingle();
        
      if (insertError) {
        console.error(`[pipeline-worker] Failed to insert run record:`, insertError);
      }
      const runId = run?.id;

      // Stage 1: cloning
      await updateStatus("cloning");
      const tCloneStart = performance.now();
      const targetDir = await cloneRepo(url);
      const durationClone = Math.round(performance.now() - tCloneStart);

      // Stage 2: fetching_commits
      await updateStatus("fetching_commits");
      const [totalCommits, defaultBranch] = await Promise.all([
        fetchGithubCommitCount(url).catch(e => 0),
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
      
      const { runAsyncVerification } = require("../services/sync-engine");
      await runAsyncVerification(repoId, targetDir, totalCommits, runId, tPipelineStart).catch(() => {});

      if (runId) {
         await supabase.from("repository_pipeline_runs").update({
           clone_duration_ms: durationClone,
           index_duration_ms: durationIndex
         }).eq("id", runId);
      }

      // Stage 5: queue analytics and transition state
      const shaToUse = latestSha || "unknown";
      await updateStatus("analytics");
      await queueAnalyticsGeneration(repoId, ["contributors", "activity", "evolution"], shaToUse);
      console.log(`[pipeline-worker] Slice 1 complete for ${repoId}. Yielding.`);
      return;
    }

    if (status === "analytics") {
      const isDone = await checkAnalyticsDone(repoId, ["contributors", "activity", "evolution"]);
      if (!isDone) {
        // Not done yet, just touch updated_at to push to back of queue
        await supabase.from("repositories").update({ updated_at: new Date().toISOString() }).eq("id", repoId);
        return;
      }

      console.log(`[pipeline-worker] Analytics complete for ${repoId}. Transitioning to journey.`);
      // Stage 6 & 7: ai_generation -> journey
      await updateStatus("ai_generation");
      await updateStatus("journey");
      
      const shaToUse = await getLatestSha(repoId);
      await queueAnalyticsGeneration(repoId, ["journey"], shaToUse);
      console.log(`[pipeline-worker] Slice 2 complete for ${repoId}. Yielding.`);
      return;
    }

    if (status === "journey") {
      const isDone = await checkAnalyticsDone(repoId, ["journey"]);
      if (!isDone) {
        // Not done yet, just touch updated_at
        await supabase.from("repositories").update({ updated_at: new Date().toISOString() }).eq("id", repoId);
        return;
      }

      console.log(`[pipeline-worker] Journey complete for ${repoId}. Pipeline fully ready.`);
      // Stage 8: ready
      await updateStatus("ready");

      const { data: run } = await supabase.from("repository_pipeline_runs")
        .select("id")
        .eq("repo_id", repoId)
        .eq("status", "in_progress")
        .maybeSingle();
        
      if (run) {
        await supabase.from("repository_pipeline_runs").update({
          status: "completed",
          completed_at: new Date().toISOString()
        }).eq("id", run.id);
      }
      
      console.log(`[pipeline-worker] Pipeline complete for ${repoId}`);
      return;
    }
  } catch (err: any) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[pipeline-worker] Pipeline failed for ${repoId} at state ${status}:`);
    console.error(err?.stack || err);
    await updateStatus("failed", errorMessage).catch(e => {
      console.error(`[pipeline-worker] Failed to update status to 'failed':`, e);
    });
    
    const { data: run } = await supabase.from("repository_pipeline_runs")
        .select("id")
        .eq("repo_id", repoId)
        .eq("status", "in_progress")
        .maybeSingle();

    if (run) {
      await supabase.from("repository_pipeline_runs").update({
        status: "failed",
        error_message: errorMessage,
        completed_at: new Date().toISOString()
      }).eq("id", run.id);
    }
  }
}
