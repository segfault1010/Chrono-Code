import { supabase } from "../lib/db";
import { cloneRepo, getDefaultBranch } from "../services/clone-service";
import { synchronizeCommits } from "../services/sync-engine";
import { fetchGithubCommitCount } from "../services/github-service";
import { queueAnalyticsGeneration } from "../services/analytics-pipeline";

let isRunning = false;
let workerInterval: NodeJS.Timeout | null = null;
const WORKER_INTERVAL_MS = 1000; // Poll every 1 second

export function startPipelineWorker() {
  console.log("[pipeline-worker] startPipelineWorker() called - checking if interval is set");
  if (workerInterval) {
    console.log("[pipeline-worker] Interval already set, skipping duplicate start.");
    return;
  }
  
  console.log("[pipeline-worker] Starting background pipeline worker...");
  
  workerInterval = setInterval(async () => {
    console.log("[pipeline-worker] Polling loop started...");
    if (isRunning) {
      console.log("[pipeline-worker] Polling skipped: already running.");
      return;
    }
    isRunning = true;
    
    try {
      console.log(`[pipeline-worker] Supabase Client Config - URL: ${process.env.SUPABASE_URL}, Service Key Length: ${process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 0}`);
      
      const { count: totalCount } = await supabase.from("repositories").select("*", { count: "exact", head: true });
      const { count: queuedCount } = await supabase.from("repositories").select("*", { count: "exact", head: true }).eq("status", "queued");
      console.log(`[pipeline-worker] Pre-poll stats - Total Repos: ${totalCount}, Queued Repos: ${queuedCount}`);

      console.log("[pipeline-worker] Executing polling query: SELECT id, github_url FROM repositories WHERE status = 'queued' LIMIT 1");
      const { data: repo, error: fetchErr, count } = await supabase
        .from("repositories")
        .select("id, github_url", { count: "exact" })
        .eq("status", "queued")
        .limit(1)
        .maybeSingle();
        
      if (fetchErr) {
        console.error("[pipeline-worker] Error fetching job:", fetchErr);
        console.error(fetchErr);
        return;
      }
      
      console.log(`[pipeline-worker] Query complete. Found ${count ?? (repo ? 1 : 0)} queued repositories.`);
      
      if (repo) {
        console.log(`[pipeline-worker] Picked up job for repo: ${repo.id}`);
        console.log(`[pipeline-worker] Processing repo <${repo.id}>`);
        await runPipeline(repo.id, repo.github_url);
      } else {
        console.log("[pipeline-worker] No queued repositories found during this poll.");
      }
    } catch (err: any) {
      console.error("[pipeline-worker] Unexpected error in worker loop:");
      console.error(err?.stack || err);
    } finally {
      isRunning = false;
    }
  }, WORKER_INTERVAL_MS);
}

async function runPipeline(repoId: string, url: string, githubToken?: string) {
  const tPipelineStart = performance.now();
  let runId: string | undefined;

  const updateStatus = async (status: string, error_message: string | null = null, extra: any = {}) => {
    console.log(`[pipeline-worker] Status -> ${status}`);
    const { data, error, count } = await supabase.from("repositories").update({ status, error_message, ...extra }).eq("id", repoId).select("*");
    
    if (error) {
      console.error(`[pipeline-worker] FATAL DB ERROR: Failed to transition repo ${repoId} to state ${status}:`, error);
      throw new Error(`Database error on status update to ${status}: ${error.message}`);
    }
    
    console.log(`[pipeline-worker] Status update successful. Affected rows: ${data?.length || 0}`);
    if (!data || data.length === 0) {
      console.warn(`[pipeline-worker] WARNING: Status update to ${status} affected 0 rows for repo ${repoId}.`);
    }
  };

  try {
    console.log(`[pipeline-worker] Starting Phase 0: pending for repo ${repoId}`);
    // Phase 0: pending
    await updateStatus("pending");

    console.log(`[pipeline-worker] Inserting run record for repo ${repoId}`);
    const { data: run, error: insertError } = await supabase
      .from("repository_pipeline_runs")
      .insert({ repo_id: repoId, status: "in_progress" })
      .select("id")
      .maybeSingle();
      
    if (insertError) {
      console.error(`[pipeline-worker] Failed to insert run record:`, insertError);
    }
    
    if (run) runId = run.id;

    console.log(`[pipeline-worker] Starting Stage 1: cloning for repo ${repoId}`);
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
    console.log(`[pipeline-worker] STAGE_START: analytics for repo ${repoId}`);
    
    console.log(`[pipeline-worker] ASYNC_CALL: updateStatus("analytics")`);
    await updateStatus("analytics");
    console.log(`[pipeline-worker] PROMISE_AWAITED: updateStatus("analytics")`);
    
    const shaToUse = latestSha || "unknown";
    
    console.log(`[pipeline-worker] ASYNC_CALL: queueAnalyticsGeneration(["contributors", "activity", "evolution"])`);
    await queueAnalyticsGeneration(repoId, ["contributors", "activity", "evolution"], shaToUse);
    console.log(`[pipeline-worker] PROMISE_AWAITED: queueAnalyticsGeneration(["contributors", "activity", "evolution"])`);
    
    console.log(`[pipeline-worker] ASYNC_CALL: waitForAnalytics(["contributors", "activity", "evolution"])`);
    await waitForAnalytics(repoId, ["contributors", "activity", "evolution"]);
    console.log(`[pipeline-worker] PROMISE_AWAITED: waitForAnalytics(["contributors", "activity", "evolution"])`);
    
    console.log(`[pipeline-worker] STAGE_COMPLETE: analytics for repo ${repoId}`);

    // Stage 6: ai_generation
    console.log(`[pipeline-worker] TRANSITION: analytics -> ai_generation`);
    console.log(`[pipeline-worker] ASYNC_CALL: updateStatus("ai_generation")`);
    await updateStatus("ai_generation");
    console.log(`[pipeline-worker] PROMISE_AWAITED: updateStatus("ai_generation")`);
    
    // Stage 7: journey
    console.log(`[pipeline-worker] TRANSITION: ai_generation -> journey`);
    console.log(`[pipeline-worker] STAGE_START: journey for repo ${repoId}`);
    
    console.log(`[pipeline-worker] ASYNC_CALL: updateStatus("journey")`);
    await updateStatus("journey");
    console.log(`[pipeline-worker] PROMISE_AWAITED: updateStatus("journey")`);
    
    console.log(`[pipeline-worker] ASYNC_CALL: queueAnalyticsGeneration(["journey"])`);
    await queueAnalyticsGeneration(repoId, ["journey"], shaToUse);
    console.log(`[pipeline-worker] PROMISE_AWAITED: queueAnalyticsGeneration(["journey"])`);
    
    console.log(`[pipeline-worker] ASYNC_CALL: waitForAnalytics(["journey"])`);
    await waitForAnalytics(repoId, ["journey"]);
    console.log(`[pipeline-worker] PROMISE_AWAITED: waitForAnalytics(["journey"])`);
    
    console.log(`[pipeline-worker] STAGE_COMPLETE: journey for repo ${repoId}`);

    // Stage 8: ready
    console.log(`[pipeline-worker] TRANSITION: journey -> ready`);
    console.log(`[pipeline-worker] ASYNC_CALL: updateStatus("ready")`);
    await updateStatus("ready");
    console.log(`[pipeline-worker] PROMISE_AWAITED: updateStatus("ready")`);

    if (runId) {
      await supabase.from("repository_pipeline_runs").update({
        clone_duration_ms: durationClone,
        index_duration_ms: durationIndex,
        status: "completed",
        completed_at: new Date().toISOString()
      }).eq("id", runId);
    }
    
    console.log(`[pipeline-worker] Pipeline complete for ${repoId}`);

  } catch (err: any) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[pipeline-worker] Pipeline failed for ${repoId}:`);
    console.error(err?.stack || err);
    await updateStatus("failed", errorMessage).catch(e => {
      console.error(`[pipeline-worker] Failed to update status to 'failed':`, e);
    });
    
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
  console.log(`[pipeline-worker] [waitForAnalytics] Starting wait for types: ${types.join(', ')} (Repo: ${repoId})`);
  // Wait up to 5 minutes for analytics to finish
  let attempts = 0;
  while (attempts < 60) {
    console.log(`[pipeline-worker] [waitForAnalytics] Attempt ${attempts + 1}/60. Querying repository_analytics...`);
    const { data, error } = await supabase.from("repository_analytics")
      .select("status, analytics_type")
      .eq("repo_id", repoId)
      .in("analytics_type", types);
      
    if (error) {
      console.error(`[pipeline-worker] [waitForAnalytics] Supabase query error:`, error);
    }
      
    console.log(`[pipeline-worker] [waitForAnalytics] Query returned data:`, data);
      
    if (!data || data.length === 0) {
      console.log(`[pipeline-worker] [waitForAnalytics] No data found. Breaking wait loop.`);
      break;
    }
    
    const allDone = data.every(a => a.status === "completed" || a.status === "error");
    console.log(`[pipeline-worker] [waitForAnalytics] Check allDone (${allDone}) based on status.`);
    
    if (allDone) {
      console.log(`[pipeline-worker] [waitForAnalytics] allDone is true! Breaking wait loop.`);
      break;
    }
    
    console.log(`[pipeline-worker] [waitForAnalytics] Sleeping for 5000ms...`);
    await new Promise(r => setTimeout(r, 5000));
    console.log(`[pipeline-worker] [waitForAnalytics] Woke up from sleep.`);
    attempts++;
  }
  console.log(`[pipeline-worker] [waitForAnalytics] Wait complete after ${attempts} attempts.`);
}
