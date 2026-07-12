import { supabase } from "../lib/db";
import { cloneRepo, getCommitCount, fetchLatest } from "../services/clone-service";
import { parseCommitsSince, ParsedCommit } from "../services/git-log-service";
import { randomUUID } from "crypto";

/**
 * Start a lightweight sync job that fetches only NEW commits since the last sync.
 * This is independent from historical indexing and completes in seconds.
 * 
 * Flow:
 *   1. git fetch origin (on existing bare clone)
 *   2. git log <last_indexed_sha>..HEAD (only new commits)
 *   3. Insert new commits into DB
 *   4. Update metadata
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
    // 1. Fetch latest from origin
    const targetDir = await cloneRepo(url, githubToken);
    await fetchLatest(targetDir, githubToken);

    // 2. Get updated total commit count
    const newTotalCommits = await getCommitCount(targetDir);

    // 3. If we have a last_indexed_sha, fetch only commits since that SHA
    let newCommits: ParsedCommit[] = [];
    
    if (repo.last_indexed_sha) {
      newCommits = await parseCommitsSince(targetDir, repo.last_indexed_sha);
      console.log(`[chronocode-api] Sync found ${newCommits.length} new commits since ${repo.last_indexed_sha.substring(0, 7)}`);
    } else {
      // No previous SHA — this shouldn't happen in normal flow,
      // but handle it gracefully by not re-indexing everything
      console.log(`[chronocode-api] Sync: No last_indexed_sha, skipping delta fetch`);
    }

    // 4. Insert new commits (if any)
    if (newCommits.length > 0) {
      await bulkInsertNewCommits(repoId, newCommits);
    }

    // 5. Get the latest SHA from HEAD for tracking
    // The first commit in newCommits is the newest (git log outputs newest first)
    const latestSha = newCommits.length > 0
      ? newCommits[0]!.commit.sha
      : repo.last_indexed_sha;

    // 6. Update metadata
    const newIndexedCount = (repo.indexed_commits || 0) + newCommits.length;
    
    await supabase
      .from("repositories")
      .update({
        total_commits: newTotalCommits,
        indexed_commits: newIndexedCount,
        last_indexed_sha: latestSha,
        indexing_progress: newTotalCommits > 0
          ? Math.min(Math.round((newIndexedCount / newTotalCommits) * 100 * 10) / 10, 100)
          : 100,
        last_indexed_at: new Date().toISOString(),
        // Restore previous status (important: don't break ongoing indexing_history)
        status: previousStatus === "indexing_history" ? "indexing_history" : "ready",
        error_message: null,
      })
      .eq("id", repoId);

    console.log(`[chronocode-api] Sync complete for ${repoId}: +${newCommits.length} commits, total ${newIndexedCount}`);
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

/**
 * Insert new commits from sync. Similar to bulkInsertCommits in index-repo-job,
 * but optimized for small batches (sync typically returns 1-50 new commits).
 */
async function bulkInsertNewCommits(repoId: string, parsedCommits: ParsedCommit[]) {
  const CHUNK_SIZE = 100;
  let totalInserted = 0;

  for (let i = 0; i < parsedCommits.length; i += CHUNK_SIZE) {
    const chunk = parsedCommits.slice(i, i + CHUNK_SIZE);
    const chunkShas = chunk.map(pc => pc.commit.sha);
    
    // Check for duplicates in this chunk
    const { data: existingCommits, error: existingError } = await supabase
      .from("commits")
      .select("sha")
      .eq("repo_id", repoId)
      .in("sha", chunkShas);

    if (existingError) {
      console.error(`[chronocode-api] Sync error checking existing commits:`, existingError);
      throw new Error(`Failed to check existing sync commits: ${existingError.message}`);
    }

    const existingShas = new Set(existingCommits?.map(c => c.sha) || []);
    const newCommits = chunk.filter(pc => !existingShas.has(pc.commit.sha));

    if (newCommits.length === 0) continue;

    const commitsToInsert = newCommits.map(pc => ({
      id: randomUUID(),
      repo_id: repoId,
      ...pc.commit,
    }));

    const { error: commitError } = await supabase
      .from("commits")
      .insert(commitsToInsert);

    if (commitError) {
      console.error(`[chronocode-api] Sync insert error:`, commitError);
      throw new Error(`Failed to insert sync commits: ${commitError.message}`);
    }

    // Insert files
    const filesToInsert = [];
    for (let j = 0; j < newCommits.length; j++) {
      const commitId = commitsToInsert[j]!.id;
      for (const file of newCommits[j]!.files) {
        filesToInsert.push({
          commit_id: commitId,
          ...file,
        });
      }
    }

    if (filesToInsert.length > 0) {
      // Chunk file inserts as well
      const FILE_CHUNK_SIZE = 2000;
      for (let k = 0; k < filesToInsert.length; k += FILE_CHUNK_SIZE) {
        const fileChunk = filesToInsert.slice(k, k + FILE_CHUNK_SIZE);
        const { error: fileError } = await supabase
          .from("commit_files")
          .insert(fileChunk);

        if (fileError) {
          console.error(`[chronocode-api] Sync file insert error:`, fileError);
        }
      }
    }
    
    totalInserted += newCommits.length;
  }

  console.log(`[chronocode-api] Sync: Inserted ${totalInserted} new commits.`);
}
