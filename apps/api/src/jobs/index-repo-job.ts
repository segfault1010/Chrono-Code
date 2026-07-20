import { supabase } from "../lib/db";
import { cloneRepo, getDefaultBranch } from "../services/clone-service";
import { synchronizeCommits } from "../services/sync-engine";
import { fetchGithubCommitCount } from "../services/github-service";
import { queueAnalyticsGeneration } from "../services/analytics-pipeline";

/**
 * Start the progressive indexing job or resume an existing one.
 * Uses the robust sync-engine to stream commits and stop when history is complete.
 */
export async function startIndexingJob(repoId: string, url: string, githubToken?: string) {
  runIndexingPipeline(repoId, url, githubToken).catch((err) => {
    console.error(`[chronocode-api] Indexing pipeline failed for ${repoId}:`, err);
  });
}

export async function resumeIndexingJob(repoId: string, url: string, githubToken?: string) {
  startIndexingJob(repoId, url, githubToken);
}

async function runIndexingPipeline(repoId: string, url: string, githubToken?: string) {
  let runId: string | undefined;
  const tPipelineStart = performance.now();
  
  try {
    // 0. Create pipeline run record
    const { data: run, error: runErr } = await supabase
      .from("repository_pipeline_runs")
      .insert({ repo_id: repoId, status: "in_progress" })
      .select("id")
      .single();
      
    if (runErr) {
      console.warn(`[chronocode-api] Failed to create pipeline run record for ${repoId}:`, runErr);
    } else {
      runId = run.id;
    }

    // 1. Update status to cloning
    await updateRepoStatus(repoId, "cloning");

    // 2. Clone the repository (full history, blobless)
    const tCloneStart = performance.now();
    const targetDir = await cloneRepo(url, githubToken);
    const durationClone = Math.round(performance.now() - tCloneStart);

    // 3. Get true total commit count from GitHub API for verification
    await updateRepoStatus(repoId, "indexing");
    const [totalCommits, defaultBranch] = await Promise.all([
      fetchGithubCommitCount(url, githubToken).catch(e => {
        console.error(`Failed to get GitHub commit count: ${e.message}, falling back to 0`);
        return 0;
      }),
      getDefaultBranch(targetDir)
    ]);

    console.log(`[chronocode-api] GitHub reports ${totalCommits} total commits for ${url}`);

    // 4. Set initial metadata
    await supabase
      .from("repositories")
      .update({
        total_commits: totalCommits,
        default_branch: defaultBranch,
        status: "indexing_history"
      })
      .eq("id", repoId);

    // 5. Run the robust sync engine
    const tIndexStart = performance.now();
    let isFirstChunk = true;
    const { latestSha } = await synchronizeCommits(repoId, targetDir, async (insertedCount, currentLatestSha) => {
      // Re-count from DB accurately
      const { count } = await supabase
        .from("commits")
        .select("*", { count: "exact", head: true })
        .eq("repo_id", repoId);
        
      const currentTotal = count || 0;
      const progress = totalCommits > 0 
        ? Math.min(Math.round((currentTotal / totalCommits) * 100 * 10) / 10, 100) 
        : 100;

      await supabase
        .from("repositories")
        .update({
          indexed_commits: currentTotal,
          last_indexed_sha: currentLatestSha,
          indexing_progress: progress,
          last_indexed_at: new Date().toISOString(),
          // Ensure it's marked as indexing_history if not done
          status: "indexing_history"
        })
        .eq("id", repoId);
        
      console.log(`[chronocode-api] Indexing progress for ${url}: ${currentTotal}/${totalCommits} (${progress}%)`);
      isFirstChunk = false;
    });
    const durationIndex = Math.round(performance.now() - tIndexStart);

    // 6. Finalize Indexing & Update State to Verifying
    const tDbWriteStart = performance.now();
    const { count: finalCount } = await supabase
      .from("commits")
      .select("*", { count: "exact", head: true })
      .eq("repo_id", repoId);

    const actualCount = finalCount || 0;
    const finalProgress = totalCommits > 0 
      ? Math.min(Math.round((actualCount / Math.max(actualCount, totalCommits)) * 100 * 10) / 10, 100) 
      : 100;

    await supabase
      .from("repositories")
      .update({
        status: "verifying",
        error_message: null,
        indexed_commits: actualCount,
        indexing_progress: finalProgress,
        last_indexed_at: new Date().toISOString(),
        ...(latestSha ? { last_indexed_sha: latestSha } : {})
      })
      .eq("id", repoId);
    const durationDbWrite = Math.round(performance.now() - tDbWriteStart);

    // 7. Queue Analytics (Independent)
    const tAnalyticsStart = performance.now();
    const shaToUse = latestSha || "unknown"; // Or fetch from db
    await queueAnalyticsGeneration(repoId, ["journey", "contributors", "activity", "evolution"], shaToUse);
    const durationAnalytics = Math.round(performance.now() - tAnalyticsStart);

    // 8. Update Pipeline Run (Before Verification)
    if (runId) {
       await supabase.from("repository_pipeline_runs").update({
          clone_duration_ms: durationClone,
          index_duration_ms: durationIndex,
          db_write_duration_ms: durationDbWrite,
          analytics_queue_duration_ms: durationAnalytics
       }).eq("id", runId);
    }

    // 9. Fire-and-forget Event-Driven Verification
    const { runAsyncVerification } = require("../services/sync-engine");
    runAsyncVerification(repoId, targetDir, totalCommits, runId, tPipelineStart, true).catch((err: any) => {
      console.error(`[chronocode-api] Unhandled error triggering async verification for ${repoId}:`, err);
    });

    const durationTotal = Math.round(performance.now() - tPipelineStart);
    
    console.log(`[chronocode-api] [Profiling] Indexing pipeline complete for ${repoId}.`);
    console.log(`[chronocode-api] [Profiling] Clone: ${durationClone}ms | Index: ${durationIndex}ms | DB Write: ${durationDbWrite}ms | Analytics Queueing: ${durationAnalytics}ms | Total Pipeline Duration: ${durationTotal}ms`);

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await updateRepoStatus(repoId, "failed", errorMessage);
    
    if (runId) {
      await supabase
        .from("repository_pipeline_runs")
        .update({
          status: "failed",
          error_message: errorMessage,
          completed_at: new Date().toISOString()
        })
        .eq("id", runId);
    }
    throw err;
  }
}

async function updateRepoStatus(repoId: string, status: string, errorMessage: string | null = null) {
  await supabase
    .from("repositories")
    .update({ status, error_message: errorMessage })
    .eq("id", repoId);
}
