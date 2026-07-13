import { supabase } from "../lib/db";
import { cloneRepo, getDefaultBranch } from "../services/clone-service";
import { synchronizeCommits } from "../services/sync-engine";
import { fetchGithubCommitCount } from "../services/github-service";

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
  try {
    // 1. Update status to cloning
    await updateRepoStatus(repoId, "cloning");

    // 2. Clone the repository (full history, blobless)
    const targetDir = await cloneRepo(url, githubToken);

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

    // 6. Verification Step
    const { count: finalCount } = await supabase
      .from("commits")
      .select("*", { count: "exact", head: true })
      .eq("repo_id", repoId);

    const actualCount = finalCount || 0;
    
    let finalStatus = "ready";
    // Check if we match GitHub's count exactly (or if GitHub count failed to fetch)
    if (totalCommits > 0 && actualCount < totalCommits) {
      console.warn(`[chronocode-api] WARNING: Sync verification failed for ${url}. DB has ${actualCount}, GitHub reports ${totalCommits}.`);
      finalStatus = "indexing_history"; // Prevent marking as ready if commits are missing
    }

    const finalProgress = totalCommits > 0 
      ? Math.min(Math.round((actualCount / Math.max(actualCount, totalCommits)) * 100 * 10) / 10, 100) 
      : 100;

    await supabase
      .from("repositories")
      .update({
        status: finalStatus,
        indexed_commits: actualCount,
        indexing_progress: finalProgress,
        last_indexed_at: new Date().toISOString(),
        ...(latestSha ? { last_indexed_sha: latestSha } : {})
      })
      .eq("id", repoId);

    console.log(`[chronocode-api] Indexing complete for ${url}: ${actualCount} commits total`);

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await updateRepoStatus(repoId, "failed", errorMessage);
    throw err;
  }
}

async function updateRepoStatus(repoId: string, status: string, errorMessage: string | null = null) {
  await supabase
    .from("repositories")
    .update({ status, error_message: errorMessage })
    .eq("id", repoId);
}
