import { supabase } from "../lib/db";
import { cloneRepo, getDefaultBranch } from "../services/clone-service";
import { synchronizeCommits } from "../services/sync-engine";
import { fetchGithubCommitCount } from "../services/github-service";
import { queueAnalyticsGeneration } from "../services/analytics-pipeline";
import { executeWithTimeout } from "../lib/async-timeout";

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
        .in("status", ["queued"])
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

async function runPipelineSlice(repoId: string, url: string, status: string) {
  const tPipelineStart = performance.now();
  
  let runId: string | null = null;
  const fetchRunId = async () => {
    if (runId) return runId;
    const { data } = await supabase.from("repository_pipeline_runs").select("id").eq("repo_id", repoId).eq("status", "in_progress").maybeSingle();
    runId = data?.id || null;
    return runId;
  };

  const updateStatus = async (newStatus: string, expectedStatus?: string | null, error_message: string | null = null, extra: any = {}) => {
    console.log(`[pipeline-worker] Status -> ${newStatus}`);
    
    let query = supabase.from("repositories").update({ 
      status: newStatus, 
      error_message, 
      updated_at: new Date().toISOString(),
      ...extra 
    }).eq("id", repoId);
    
    if (expectedStatus) {
      query = query.eq("status", expectedStatus);
    }
    
    const { data, error } = await query.select("*");
    
    if (error) {
      console.error(`[pipeline-worker] FATAL DB ERROR: Failed to transition repo ${repoId} to state ${newStatus}:`, error);
      throw new Error(`Database error on status update to ${newStatus}: ${error.message}`);
    }
    
    if (expectedStatus && (!data || data.length === 0)) {
       throw new Error("ConcurrencyError: Repository status changed by another worker.");
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
      await updateStatus("pending", "queued");

      const { data: run, error: insertError } = await supabase
        .from("repository_pipeline_runs")
        .insert({ repo_id: repoId, status: "in_progress" })
        .select("id")
        .maybeSingle();
        
      if (insertError) {
        console.error(`[pipeline-worker] Failed to insert run record:`, insertError);
      }
      const currentRunId = run?.id;
      runId = currentRunId;

      // Stage 1: cloning
      await updateStatus("cloning", "pending");
      const cloneResult = await executeWithTimeout(
        { timeoutMs: 5 * 60 * 1000, taskName: "Clone", repoId },
        () => cloneRepo(url)
      );
      if (cloneResult.status !== "success" || !cloneResult.result) {
        throw cloneResult.error || new Error("Clone failed or timed out");
      }
      const targetDir = cloneResult.result;

      // Stage 2: fetching_commits
      await updateStatus("fetching_commits", "cloning");
      const fetchResult = await executeWithTimeout(
        { timeoutMs: 2 * 60 * 1000, taskName: "Fetch Meta", repoId },
        async () => {
          const [totalCommits, defaultBranch] = await Promise.all([
            fetchGithubCommitCount(url).catch(e => 0),
            getDefaultBranch(targetDir)
          ]);
          return { totalCommits, defaultBranch };
        }
      );
      if (fetchResult.status !== "success" || !fetchResult.result) {
        throw fetchResult.error || new Error("Fetch Meta failed or timed out");
      }
      const { totalCommits, defaultBranch } = fetchResult.result;
      await supabase.from("repositories").update({ total_commits: totalCommits, default_branch: defaultBranch }).eq("id", repoId);

      // Stage 3: indexing (store commits)
      await updateStatus("indexing", "fetching_commits");
      const indexResult = await executeWithTimeout(
        { timeoutMs: 15 * 60 * 1000, taskName: "Sync Commits", repoId },
        () => synchronizeCommits(repoId, targetDir, async (insertedCount, currentLatestSha) => {
          const { count } = await supabase.from("commits").select("*", { count: "exact", head: true }).eq("repo_id", repoId);
          const currentTotal = count || 0;
          const progress = totalCommits > 0 ? Math.min(Math.round((currentTotal / totalCommits) * 100 * 10) / 10, 100) : 100;
          
          await updateStatus("indexing", null, null, {
            indexed_commits: currentTotal,
            last_indexed_sha: currentLatestSha,
            indexing_progress: progress,
            last_indexed_at: new Date().toISOString()
          });
        })
      );
      if (indexResult.status !== "success" || !indexResult.result) {
        throw indexResult.error || new Error("Sync Commits failed or timed out");
      }
      const { latestSha } = indexResult.result;

      // Final progress update
      const { count: finalCount } = await supabase.from("commits").select("*", { count: "exact", head: true }).eq("repo_id", repoId);
      const actualCount = finalCount || 0;
      const finalProgress = totalCommits > 0 ? Math.min(Math.round((actualCount / Math.max(actualCount, totalCommits)) * 100 * 10) / 10, 100) : 100;
      
      const shaToUse = latestSha || "unknown";

      // IMPORTANT: Repository is now READY. AI/Analytics are fully backgrounded.
      await updateStatus("ready", "indexing", null, {
        indexed_commits: actualCount,
        indexing_progress: finalProgress,
        last_indexed_at: new Date().toISOString(),
        ...(latestSha ? { last_indexed_sha: latestSha } : {})
      });
      
      console.log(`[pipeline-worker] Repository ${repoId} is now READY. Commits indexed successfully.`);

      // Update Pipeline Run metrics
      if (currentRunId) {
         const totalDuration = Math.round(performance.now() - tPipelineStart);
         await supabase.from("repository_pipeline_runs").update({
           clone_duration_ms: cloneResult.durationMs,
           index_duration_ms: indexResult.durationMs,
           total_duration_ms: totalDuration,
           status: "completed",
           completed_at: new Date().toISOString()
         }).eq("id", currentRunId);
      }

      // Background Stage 4: Queue Analytics
      console.log(`[pipeline-worker] Queueing background analytics for ${repoId}`);
      await queueAnalyticsGeneration(repoId, ["contributors", "activity", "evolution", "journey"], shaToUse).catch(err => {
        console.error(`[pipeline-worker] Failed to queue background analytics:`, err);
      });

      // Background Stage 5: Async Verification (Health Check)
      console.log(`[pipeline-worker] Triggering background verification for ${repoId}`);
      const { runAsyncVerification } = require("../services/sync-engine");
      runAsyncVerification(repoId, targetDir, totalCommits, currentRunId, tPipelineStart, false).catch((err: any) => {
        console.error(`[pipeline-worker] Async verification background task error:`, err);
      });

      return;
    }
  } catch (err: any) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[pipeline-worker] Pipeline failed for ${repoId} at state ${status}:`);
    console.error(err?.stack || err);
    await updateStatus("failed", null, errorMessage).catch(e => {
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
