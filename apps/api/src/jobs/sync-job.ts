import { supabase } from "../lib/db";
import { cloneRepo, fetchLatest } from "../services/clone-service";
import { synchronizeCommits } from "../services/sync-engine";
import { fetchGithubCommitCount } from "../services/github-service";
import { queueAnalyticsGeneration } from "../services/analytics-pipeline";

/**
 * Start a lightweight sync job that fetches only NEW commits since the last sync.
 * This uses the exact same robust engine as indexing, allowing it to seamlessly
 * handle force-pushes, moved HEADs, and complex branch merges.
 */
export async function startSyncJob(repoId: string, url: string, githubToken?: string) {
  runSyncPipeline(repoId, url, githubToken).catch((err) => {
    console.error(`[chronocode-api] Sync job failed for ${repoId}:`, err);
  });
}

async function runSyncPipeline(repoId: string, url: string, githubToken?: string) {
  // Read current state before starting
  const { data: repo, error: repoError } = await supabase
    .from("repositories")
    .select("status, last_indexed_sha, indexed_commits, total_commits")
    .eq("id", repoId)
    .single();

  if (repoError || !repo) {
    console.error(`[chronocode-api] Sync: Could not find repo ${repoId}`);
    return;
  }

  // Remember previous status so we can restore it after sync
  const previousStatus = repo.status;

  try {
    const tPipelineStart = performance.now();

    // 1. Fetch latest from origin
    const tCloneStart = performance.now();
    const targetDir = await cloneRepo(url, githubToken);
    await fetchLatest(targetDir, githubToken);
    const durationClone = Math.round(performance.now() - tCloneStart);

    // 2. Get updated total commit count from GitHub API for verification
    const newTotalCommits = await fetchGithubCommitCount(url, githubToken).catch(e => {
      console.error(`[chronocode-api] Sync verification: Failed to fetch GitHub count: ${e.message}`);
      return repo.total_commits;
    });

    // 3. Run robust synchronization
    const tIndexStart = performance.now();
    const { insertedCount, latestSha } = await synchronizeCommits(repoId, targetDir);
    const durationIndex = Math.round(performance.now() - tIndexStart);

    // 4. Update metadata and state to Verifying
    const tDbWriteStart = performance.now();
    const { count: finalCount } = await supabase
      .from("commits")
      .select("*", { count: "exact", head: true })
      .eq("repo_id", repoId);
      
    const actualCount = finalCount || 0;

    let finalStatus = previousStatus === "indexing_history" ? "indexing_history" : "verifying";

    const finalProgress = newTotalCommits > 0 
      ? Math.min(Math.round((actualCount / Math.max(actualCount, newTotalCommits)) * 100 * 10) / 10, 100) 
      : 100;

    await supabase
      .from("repositories")
      .update({
        total_commits: newTotalCommits,
        indexed_commits: actualCount,
        ...(latestSha ? { last_indexed_sha: latestSha } : {}),
        indexing_progress: finalProgress,
        last_indexed_at: new Date().toISOString(),
        status: finalStatus,
        error_message: null,
      })
      .eq("id", repoId);
    const durationDbWrite = Math.round(performance.now() - tDbWriteStart);

    // 5. Queue Analytics (Independent)
    const tAnalyticsStart = performance.now();
    const shaToUse = latestSha || repo.last_indexed_sha || "unknown";
    await queueAnalyticsGeneration(repoId, ["journey", "contributors", "activity", "evolution"], shaToUse);
    const durationAnalytics = Math.round(performance.now() - tAnalyticsStart);

    // 6. Fire-and-forget Event-Driven Verification
    if (finalStatus === "verifying") {
      const { runAsyncVerification } = require("../services/sync-engine");
      runAsyncVerification(repoId, targetDir, newTotalCommits).catch((err: any) => {
        console.error(`[chronocode-api] Unhandled error triggering async verification for ${repoId}:`, err);
      });
    }

    const durationTotal = Math.round(performance.now() - tPipelineStart);
    
    console.log(`[chronocode-api] [Profiling] Sync complete for ${repoId}: +${insertedCount} commits, total ${actualCount}.`);
    console.log(`[chronocode-api] [Profiling] Clone: ${durationClone}ms | Index: ${durationIndex}ms | DB Write: ${durationDbWrite}ms | Analytics Queueing: ${durationAnalytics}ms | Total Pipeline Duration: ${durationTotal}ms`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[chronocode-api] Sync failed for ${repoId}:`, errorMessage);
    
    // Restore previous status on failure — don't mark as failed for sync errors
    await supabase
      .from("repositories")
      .update({
        status: previousStatus === "indexing_history" ? "indexing_history" : "ready",
        error_message: `Sync failed: ${errorMessage}`,
      })
      .eq("id", repoId);
  }
}
