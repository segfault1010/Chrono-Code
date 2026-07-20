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
        .in("status", ["queued", "analytics", "journey", "ai_generation"])
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
  
  return data.every(a => a.status === "completed" || a.status === "ready" || a.status === "error");
}

async function getLatestSha(repoId: string) {
  const { data } = await supabase.from("repositories").select("last_indexed_sha").eq("id", repoId).maybeSingle();
  return data?.last_indexed_sha || "unknown";
}

async function runPipelineSlice(repoId: string, url: string, status: string) {
  const tPipelineStart = performance.now();
  
  let runId: string | null = null;
  const fetchRunId = async () => {
    if (runId) return runId;
    const { data } = await supabase.from("repository_pipeline_runs").select("id").eq("repo_id", repoId).eq("status", "in_progress").maybeSingle();
    runId = data?.id || null;
    return runId;
  };

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

    try {
      const { computePipelineState } = require("../services/pipeline-state-service");
      const commitsProgress = data && data[0] && data[0].total_commits > 0 ? (data[0].indexed_commits / data[0].total_commits) * 100 : 0;
      await computePipelineState(repoId, newStatus, commitsProgress, data?.[0]?.total_commits || 0);
    } catch (err) {
      console.error(`[pipeline-worker] Failed to compute pipeline state:`, err);
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
      console.time(`[Pipeline:${repoId}] Clone Stage`);
      await updateStatus("cloning");
      const tCloneStart = performance.now();
      const targetDir = await cloneRepo(url);
      const durationClone = Math.round(performance.now() - tCloneStart);
      console.timeEnd(`[Pipeline:${repoId}] Clone Stage`);

      // Stage 2: fetching_commits
      console.time(`[Pipeline:${repoId}] Fetch Meta Stage`);
      await updateStatus("fetching_commits");
      const [totalCommits, defaultBranch] = await Promise.all([
        fetchGithubCommitCount(url).catch(e => 0),
        getDefaultBranch(targetDir)
      ]);
      await supabase.from("repositories").update({ total_commits: totalCommits, default_branch: defaultBranch }).eq("id", repoId);
      console.timeEnd(`[Pipeline:${repoId}] Fetch Meta Stage`);

      // Stage 3: indexing (store commits)
      console.time(`[Pipeline:${repoId}] Indexing Stage`);
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
      console.timeEnd(`[Pipeline:${repoId}] Indexing Stage`);

      // Stage 4: verifying
      console.time(`[Pipeline:${repoId}] Verifying Stage`);
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
      console.timeEnd(`[Pipeline:${repoId}] Verifying Stage`);

      if (runId) {
         await supabase.from("repository_pipeline_runs").update({
           clone_duration_ms: durationClone,
           index_duration_ms: durationIndex
         }).eq("id", runId);
      }

      // Stage 5: queue analytics and journey in parallel
      console.time(`[Pipeline:${repoId}] Queue Analytics Stage`);
      const shaToUse = latestSha || "unknown";
      await updateStatus("analytics");
      await queueAnalyticsGeneration(repoId, ["contributors", "activity", "evolution", "journey"], shaToUse);
      console.timeEnd(`[Pipeline:${repoId}] Queue Analytics Stage`);
      console.log(`[pipeline-worker] Slice 1 complete for ${repoId}. Yielding.`);
      return;
    }

    if (status === "analytics") {
      const isDone = await checkAnalyticsDone(repoId, ["contributors", "activity", "evolution", "journey"]);
      if (!isDone) {
        // Not done yet, just touch updated_at to push to back of queue
        await supabase.from("repositories").update({ updated_at: new Date().toISOString() }).eq("id", repoId);
        return;
      }

      console.log(`[pipeline-worker] Analytics & Journey complete for ${repoId}. Starting AI Generation.`);
      await updateStatus("ai_generation");
      
      // Proactively trigger Repository Story (Insights)
      try {
        const { getOrGenerateJourneyInsights } = require("../services/insights-service");
        const { getCachedAnalytics } = require("../services/analytics-pipeline");
        const journey = await getCachedAnalytics(repoId, "journey");
        if (journey) {
          await getOrGenerateJourneyInsights(repoId, journey, false);
        }
      } catch (err) {
        console.error(`[pipeline-worker] Failed to queue AI insights:`, err);
      }
      return;
    }
      
    if (status === "ai_generation") {
      // Check if insights is done
      const { data: insights } = await supabase.from("repository_insights").select("status").eq("repository_id", repoId).maybeSingle();
      const isStoryDone = insights && (insights.status === "completed" || insights.status === "error");
      
      const { total_commits } = await supabase.from("repositories").select("total_commits").eq("id", repoId).single().then(r => r.data || { total_commits: 0 });
      // Risk is deferred, so we just wait for Story to be done
      const isRiskDone = true;
      
      if (!isStoryDone) {
         // Recompute state for accurate progress without transitioning
         const { computePipelineState } = require("../services/pipeline-state-service");
         await computePipelineState(repoId, "ai_generation", 100, total_commits);
         
         await supabase.from("repositories").update({ updated_at: new Date().toISOString() }).eq("id", repoId);
         return;
      }
      
      console.log(`[pipeline-worker] AI Generation complete for ${repoId}. Pipeline fully ready.`);
      await updateStatus("ready");

      const { data: run } = await supabase.from("repository_pipeline_runs")
        .select("id")
        .eq("repo_id", repoId)
        .eq("status", "in_progress")
        .maybeSingle();
        
      if (run) {
        const totalDuration = Math.round(performance.now() - tPipelineStart);
        await supabase.from("repository_pipeline_runs").update({
          status: "completed",
          completed_at: new Date().toISOString(),
          total_duration_ms: totalDuration
        }).eq("id", run.id);
        console.log(`[pipeline-worker] [TIMING] Pipeline completed in ${totalDuration}ms for repo ${repoId}`);
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
