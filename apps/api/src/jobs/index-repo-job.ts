import { supabase } from "../lib/db";
import { cloneRepo, validateGithubUrl, getCommitCount, getDefaultBranch } from "../services/clone-service";
import { parseCommitPage, ParsedCommit } from "../services/git-log-service";
import { generateRepositoryJourney } from "../services/journey-service";
import { getOrGenerateJourneyInsights } from "../services/insights-service";
import { randomUUID } from "crypto";

// Page size for progressive indexing — 500 commits per batch
const INDEX_PAGE_SIZE = 500;

// Delay between pages to avoid overwhelming the system (ms)
const PAGE_DELAY_MS = 100;

/**
 * Start the progressive indexing job.
 * Phase 1 (fast): Clone, count, index first page → repo is usable.
 * Phase 2 (background): Continue indexing remaining pages until complete.
 */
export async function startIndexingJob(repoId: string, url: string, githubToken?: string) {
  // Start job asynchronously. We don't await this in the route handler.
  runIndexingPipeline(repoId, url, githubToken).catch((err) => {
    console.error(`[chronocode-api] Indexing pipeline failed for ${repoId}:`, err);
  });
}

async function runIndexingPipeline(repoId: string, url: string, githubToken?: string) {
  let targetDir: string;

  try {
    // =========================================================================
    // Phase 1: Initial Setup (fast — ~5-10 seconds)
    // =========================================================================

    // 1. Update status to cloning
    await updateRepoStatus(repoId, "cloning");

    // 2. Clone the repository (full history, blobless)
    targetDir = await cloneRepo(url, githubToken);

    // 3. Get true total commit count and default branch
    await updateRepoStatus(repoId, "indexing");
    const [totalCommits, defaultBranch] = await Promise.all([
      getCommitCount(targetDir),
      getDefaultBranch(targetDir),
    ]);

    console.log(`[chronocode-api] Total commits for ${url}: ${totalCommits}`);

    // 4. Update repository with metadata immediately
    await supabase
      .from("repositories")
      .update({
        total_commits: totalCommits,
        default_branch: defaultBranch,
        status: "indexing",
      })
      .eq("id", repoId);

    // 5. Parse and insert the first page of commits (latest N)
    const firstPage = await parseCommitPage(targetDir, 0, INDEX_PAGE_SIZE);
    
    if (firstPage.length > 0) {
      await bulkInsertCommits(repoId, firstPage);
      
      // Record the last SHA of this page for resume tracking
      const lastSha = firstPage[firstPage.length - 1]!.commit.sha;
      
      await supabase
        .from("repositories")
        .update({
          indexed_commits: firstPage.length,
          last_indexed_sha: lastSha,
          indexing_progress: totalCommits > 0
            ? Math.min(Math.round((firstPage.length / totalCommits) * 100 * 10) / 10, 100)
            : 100,
          last_indexed_at: new Date().toISOString(),
          // If we got all commits in the first page, we're done
          status: firstPage.length >= totalCommits ? "ready" : "indexing_history",
        })
        .eq("id", repoId);

      console.log(`[chronocode-api] Phase 1 complete: ${firstPage.length}/${totalCommits} commits indexed for ${url}`);
    } else {
      // Empty repository
      await supabase
        .from("repositories")
        .update({
          status: "ready",
          indexed_commits: 0,
          indexing_progress: 100,
          last_indexed_at: new Date().toISOString(),
        })
        .eq("id", repoId);
      console.log(`[chronocode-api] Repository ${url} has no commits.`);
      return;
    }

    // If everything fit in the first page, we're done
    if (firstPage.length >= totalCommits) {
      console.log(`[chronocode-api] All commits indexed in first page for ${url}`);
      return;
    }

    // =========================================================================
    // Phase 2: Background History Indexing (async — can take minutes)
    // At this point the repo is fully usable with status "indexing_history"
    // =========================================================================

    let totalIndexed = firstPage.length;
    let currentSkip = INDEX_PAGE_SIZE;

    while (true) {
      // Check if the job has been cancelled (e.g., status changed externally)
      const { data: repoCheck } = await supabase
        .from("repositories")
        .select("status")
        .eq("id", repoId)
        .single();

      if (repoCheck && repoCheck.status !== "indexing_history") {
        console.log(`[chronocode-api] Indexing stopped — status changed to ${repoCheck.status}`);
        break;
      }

      // Fetch next page
      const page = await parseCommitPage(targetDir, currentSkip, INDEX_PAGE_SIZE);
      
      if (page.length === 0) {
        // No more commits to index
        break;
      }

      // Insert commits
      await bulkInsertCommits(repoId, page);
      totalIndexed += page.length;
      currentSkip += INDEX_PAGE_SIZE;

      // Update progress
      const lastSha = page[page.length - 1]!.commit.sha;
      const progress = totalCommits > 0
        ? Math.min(Math.round((totalIndexed / totalCommits) * 100 * 10) / 10, 100)
        : 100;

      await supabase
        .from("repositories")
        .update({
          indexed_commits: totalIndexed,
          last_indexed_sha: lastSha,
          indexing_progress: progress,
          last_indexed_at: new Date().toISOString(),
        })
        .eq("id", repoId);

      console.log(`[chronocode-api] Progress: ${totalIndexed}/${totalCommits} (${progress}%) for ${url}`);

      // Brief delay to avoid overwhelming the system
      if (page.length === INDEX_PAGE_SIZE) {
        await new Promise((resolve) => setTimeout(resolve, PAGE_DELAY_MS));
      }
    }

    // Mark as fully indexed
    // Re-count from DB to be accurate (dedup may have reduced the count)
    const { count: finalCount } = await supabase
      .from("commits")
      .select("*", { count: "exact", head: true })
      .eq("repo_id", repoId);

    await supabase
      .from("repositories")
      .update({
        status: "ready",
        indexed_commits: finalCount || totalIndexed,
        indexing_progress: 100,
        last_indexed_at: new Date().toISOString(),
      })
      .eq("id", repoId);

    console.log(`[chronocode-api] Indexing complete for ${url}: ${finalCount || totalIndexed} commits total`);

    // AI analysis is now triggered manually by the user via the frontend.
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await updateRepoStatus(repoId, "failed", errorMessage);
    throw err;
  }
}

/**
 * Resume an interrupted indexing job.
 * Reads the current indexed_commits count and continues from where it left off.
 */
export async function resumeIndexingJob(repoId: string, url: string, githubToken?: string) {
  runResumePipeline(repoId, url, githubToken).catch((err) => {
    console.error(`[chronocode-api] Resume indexing failed for ${repoId}:`, err);
  });
}

async function runResumePipeline(repoId: string, url: string, githubToken?: string) {
  try {
    // Get current state
    const { data: repo } = await supabase
      .from("repositories")
      .select("indexed_commits, total_commits")
      .eq("id", repoId)
      .single();

    if (!repo) return;

    // Clone/verify the repo exists locally
    const targetDir = await cloneRepo(url, githubToken);

    // Re-count total in case it changed
    const totalCommits = await getCommitCount(targetDir);
    
    await supabase
      .from("repositories")
      .update({
        status: "indexing_history",
        total_commits: totalCommits,
      })
      .eq("id", repoId);

    let totalIndexed = repo.indexed_commits || 0;
    let currentSkip = totalIndexed; // Skip already-indexed commits

    console.log(`[chronocode-api] Resuming indexing for ${url} at ${totalIndexed}/${totalCommits}`);

    while (true) {
      const { data: repoCheck } = await supabase
        .from("repositories")
        .select("status")
        .eq("id", repoId)
        .single();

      if (repoCheck && repoCheck.status !== "indexing_history") {
        break;
      }

      const page = await parseCommitPage(targetDir, currentSkip, INDEX_PAGE_SIZE);
      
      if (page.length === 0) break;

      await bulkInsertCommits(repoId, page);
      totalIndexed += page.length;
      currentSkip += INDEX_PAGE_SIZE;

      const lastSha = page[page.length - 1]!.commit.sha;
      const progress = totalCommits > 0
        ? Math.min(Math.round((totalIndexed / totalCommits) * 100 * 10) / 10, 100)
        : 100;

      await supabase
        .from("repositories")
        .update({
          indexed_commits: totalIndexed,
          last_indexed_sha: lastSha,
          indexing_progress: progress,
          last_indexed_at: new Date().toISOString(),
        })
        .eq("id", repoId);

      console.log(`[chronocode-api] Resume progress: ${totalIndexed}/${totalCommits} (${progress}%) for ${url}`);

      if (page.length === INDEX_PAGE_SIZE) {
        await new Promise((resolve) => setTimeout(resolve, PAGE_DELAY_MS));
      }
    }

    const { count: finalCount } = await supabase
      .from("commits")
      .select("*", { count: "exact", head: true })
      .eq("repo_id", repoId);

    await supabase
      .from("repositories")
      .update({
        status: "ready",
        indexed_commits: finalCount || totalIndexed,
        indexing_progress: 100,
        last_indexed_at: new Date().toISOString(),
      })
      .eq("id", repoId);

    console.log(`[chronocode-api] Resume indexing complete for ${url}`);

    // AI analysis is now triggered manually by the user via the frontend.
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

async function bulkInsertCommits(repoId: string, parsedCommits: ParsedCommit[]) {
  const CHUNK_SIZE = 100;
  let totalInserted = 0;
  
  for (let i = 0; i < parsedCommits.length; i += CHUNK_SIZE) {
    const chunk = parsedCommits.slice(i, i + CHUNK_SIZE);
    const chunkShas = chunk.map(pc => pc.commit.sha);
    
    // 1. Fetch existing SHAs in this chunk to prevent conflicts
    // We do this per-chunk because Supabase/PostgREST limits selects to 1000 rows by default.
    const { data: existingCommits, error: existingError } = await supabase
      .from("commits")
      .select("sha")
      .eq("repo_id", repoId)
      .in("sha", chunkShas);
      
    if (existingError) {
      console.error(`[chronocode-api] Error checking existing commits:`, existingError);
      throw new Error(`Failed to check existing commits: ${existingError.message}`);
    }
    
    const existingShas = new Set(existingCommits?.map(c => c.sha) || []);
    
    // 2. Filter new commits only
    const newCommits = chunk.filter(pc => !existingShas.has(pc.commit.sha));
    
    if (newCommits.length === 0) continue;
    
    totalInserted += newCommits.length;
    
    // Assign UUIDs to commits so we can link files
    const commitsToInsert = newCommits.map(pc => ({
      id: randomUUID(),
      repo_id: repoId,
      ...pc.commit
    }));
    
    // Insert commits safely
    const { error: commitError } = await supabase
      .from("commits")
      .insert(commitsToInsert);
      
    if (commitError) {
      console.error(`[chronocode-api] Bulk insert error at chunk ${i}:`, commitError);
      throw new Error(`Failed to insert commits: ${commitError.message}`);
    }

    // Insert files
    const filesToInsert = [];
    for (let j = 0; j < newCommits.length; j++) {
      const commitId = commitsToInsert[j]!.id;
      for (const file of newCommits[j]!.files) {
        filesToInsert.push({
          commit_id: commitId,
          ...file
        });
      }
    }
    
    if (filesToInsert.length > 0) {
      const FILE_CHUNK_SIZE = 2000;
      for (let k = 0; k < filesToInsert.length; k += FILE_CHUNK_SIZE) {
        const fileChunk = filesToInsert.slice(k, k + FILE_CHUNK_SIZE);
        const { error: fileError } = await supabase
          .from("commit_files")
          .insert(fileChunk);
          
        if (fileError) {
           console.error(`[chronocode-api] Bulk insert file error:`, fileError);
        }
      }
    }
  }
  
  if (totalInserted === 0) {
    console.log(`[chronocode-api] No new commits to insert.`);
  } else {
    console.log(`[chronocode-api] Inserted ${totalInserted} new commits total.`);
  }
}
