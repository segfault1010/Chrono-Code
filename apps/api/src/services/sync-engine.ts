import { supabase } from "../lib/db";
import { parseCommitPage, ParsedCommit } from "./git-log-service";
import { randomUUID } from "crypto";

export interface SyncResult {
  insertedCount: number;
  latestSha: string | null;
}

/**
 * Robust synchronization engine.
 * Instead of using an absolute `--skip` based on DB counts (which breaks if commits are added at the top),
 * this engine dynamically streams `git log` from HEAD and stops only when it hits a contiguous
 * block of already-indexed commits.
 */
export async function synchronizeCommits(
  repoId: string,
  targetDir: string,
  onProgress?: (indexedCount: number, latestSha: string) => Promise<void>
): Promise<SyncResult> {
  let skip = 0;
  const PAGE_SIZE = 500;
  let totalInserted = 0;
  let latestSha: string | null = null;

  while (true) {
    // 1. Fetch next page from local git clone
    const page = await parseCommitPage(targetDir, skip, PAGE_SIZE);
    
    if (page.length === 0) {
      break; // Reached end of local git history
    }

    if (skip === 0 && page.length > 0 && page[0]) {
      latestSha = page[0].commit.sha;
    }

    // 2. Check which commits in this page are already in the DB
    const chunkShas = page.map(pc => pc.commit.sha);
    
    // PostgREST GET requests fail if the URI is too long (500 SHAs is ~20KB).
    // We must chunk the SHAs to prevent "TypeError: fetch failed" (URI Too Long).
    const CHECK_CHUNK_SIZE = 100;
    const existingShas = new Set<string>();

    for (let i = 0; i < chunkShas.length; i += CHECK_CHUNK_SIZE) {
      const slice = chunkShas.slice(i, i + CHECK_CHUNK_SIZE);
      try {
        const { data: existingCommits, error: existingError } = await supabase
          .from("commits")
          .select("sha")
          .eq("repo_id", repoId)
          .in("sha", slice);

        if (existingError) {
          console.error(`[sync-engine] Supabase error during SHA check (chunk ${i}):`, existingError);
          throw new Error(`Failed to check existing commits: ${existingError.message}`);
        }

        if (existingCommits) {
          for (const c of existingCommits) existingShas.add(c.sha);
        }
      } catch (err) {
        console.error(`[sync-engine] Fatal error fetching existing commits. Slice length: ${slice.length}. First SHA: ${slice[0]}`, err);
        throw err;
      }
    }
    
    // 3. Stop Condition
    // If every single commit in this page of 500 already exists in the database,
    // we have successfully merged into the previously indexed history.
    // We can safely stop fetching.
    if (existingShas.size === page.length) {
      console.log(`[sync-engine] Hit contiguous block of ${page.length} indexed commits at skip=${skip}. Stopping.`);
      break;
    }

    // 4. Insert new commits
    const newCommits = page.filter(pc => !existingShas.has(pc.commit.sha));
    
    if (newCommits.length > 0) {
      await bulkInsert(repoId, newCommits);
      totalInserted += newCommits.length;
    }

    // 5. Update progress callback (useful for long initial index jobs)
    if (onProgress && latestSha) {
      await onProgress(totalInserted, latestSha);
    }

    skip += PAGE_SIZE;

    // Throttle to prevent overwhelming DB on massive initial sync
    if (page.length === PAGE_SIZE) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return { insertedCount: totalInserted, latestSha };
}

async function bulkInsert(repoId: string, newCommits: ParsedCommit[]) {
  const CHUNK_SIZE = 100;
  
  for (let i = 0; i < newCommits.length; i += CHUNK_SIZE) {
    const chunk = newCommits.slice(i, i + CHUNK_SIZE);
    
    const commitsToInsert = chunk.map(pc => ({
      repo_id: repoId,
      ...pc.commit
    }));
    
    // Use upsert with ignoreDuplicates to avoid crashing on race conditions.
    // This translates to INSERT ON CONFLICT DO NOTHING. It only returns newly inserted rows.
    const { data: insertedCommits, error: commitError } = await supabase
      .from("commits")
      .upsert(commitsToInsert, { onConflict: "repo_id, sha", ignoreDuplicates: true })
      .select("id, sha");
      
    if (commitError) {
      console.error(`[sync-engine] Bulk insert error at chunk ${i}:`, commitError);
      throw new Error(`Failed to insert commits: ${commitError.message}`);
    }

    const shaToId = new Map<string, string>();
    if (insertedCommits) {
      for (const c of insertedCommits) {
        shaToId.set(c.sha, c.id);
      }
    }

    // Insert files only for commits that were successfully inserted
    const filesToInsert = [];
    for (let j = 0; j < chunk.length; j++) {
      const commitId = shaToId.get(chunk[j]!.commit.sha);
      if (!commitId) continue; // Commit was a duplicate and ignored

      for (const file of chunk[j]!.files) {
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
           console.error(`[sync-engine] Bulk insert file error:`, fileError);
        }
      }
    }
  }
}

/**
 * Robustly verifies that the database matches the local Git clone.
 * Detects orphaned commits (force pushes), duplicated SHAs, and missing commits.
 */
export async function verifyRepositorySync(repoId: string, targetDir: string, githubTotalCommits: number): Promise<{ isValid: boolean, reason: string | null }> {
  try {
    const { execSync } = require("child_process");
    
    // 1. Local Git commit count & HEAD
    let localCommitCount = 0;
    let localHeadSha = "";
    try {
      localCommitCount = parseInt(execSync(`git rev-list --count HEAD`, { cwd: targetDir }).toString().trim());
      localHeadSha = execSync(`git rev-parse HEAD`, { cwd: targetDir }).toString().trim();
    } catch (err) {
      return { isValid: false, reason: "Failed to read local git repository state." };
    }
    
    // 2. Database commit count
    const { count: dbCommitCount, error: countError } = await supabase
      .from('commits')
      .select('id', { count: 'exact', head: true })
      .eq('repo_id', repoId);
      
    if (countError) return { isValid: false, reason: `Failed to fetch DB commit count: ${countError.message}` };
    const dbCount = dbCommitCount || 0;
      
    // 3. (Removed distinct SHAs check as PostgREST limits to 1000 rows, and DB has unique constraint on repo_id + sha)
    
    // 4. Database HEAD SHA
    const { data: latestCommit } = await supabase
      .from('commits')
      .select('sha')
      .eq('repo_id', repoId)
      .order('authored_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: repo } = await supabase
      .from('repositories')
      .select('last_indexed_sha')
      .eq('id', repoId)
      .single();
      
    // Verification Rules
    if (localCommitCount > 0 && dbCount !== localCommitCount) {
      return { isValid: false, reason: `DB commits (${dbCount}) != Local Git commits (${localCommitCount}). Possible orphaned commits from force-push.` };
    } 
    
    if (localHeadSha && latestCommit?.sha && localHeadSha !== latestCommit.sha && localHeadSha !== repo?.last_indexed_sha) {
      return { isValid: false, reason: `HEAD mismatch! Local: ${localHeadSha}, DB Latest: ${latestCommit.sha}, Repo Last Indexed: ${repo?.last_indexed_sha}` };
    }
    
    if (githubTotalCommits > 0 && dbCount < githubTotalCommits) {
      return { isValid: false, reason: `DB commits (${dbCount}) < GitHub API reports (${githubTotalCommits}).` };
    }

    return { isValid: true, reason: null };
  } catch (err) {
    return { isValid: false, reason: `Verification threw an unexpected error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Executes verification fully asynchronously as an event-driven background job.
 * Transitions the repository from 'verifying' to 'ready' (or 'verification_failed').
 */
export async function runAsyncVerification(
  repoId: string, 
  targetDir: string, 
  githubTotalCommits: number, 
  runId?: string, 
  tPipelineStart?: number, 
  shouldTransitionToReady: boolean = false
) {
  const WATCHDOG_TIMEOUT_MS = 60000; // 60 seconds
  
  try {
    console.log(`[sync-engine] Starting async verification for ${repoId}... (Terminal transition: ${shouldTransitionToReady})`);
    const t0 = performance.now();
    
    // Wrap verifyRepositorySync in a Promise.race for the watchdog timeout
    const verificationPromise = exports.verifyRepositorySync(repoId, targetDir, githubTotalCommits);
    const timeoutPromise = new Promise<{isValid: boolean, reason: string}>((_, reject) => 
      setTimeout(() => reject(new Error("Verification Watchdog Timeout: Process took too long.")), WATCHDOG_TIMEOUT_MS)
    );
    
    const verification = await Promise.race([verificationPromise, timeoutPromise]);
    const durationMs = Math.round(performance.now() - t0);
    
    if (verification.isValid) {
      console.log(`[sync-engine] [Profiling] Verification successful for ${repoId} in ${durationMs}ms.`);
      await supabase
        .from("repositories")
        .update({ 
          verification_status: "passed",
          verification_reason: null,
          error_message: null,
          ...(shouldTransitionToReady ? { status: "ready" } : {})
        })
        .eq("id", repoId);
      
      if (shouldTransitionToReady) {
        console.log(`[sync-engine] Terminated state machine: Transitioned ${repoId} to 'ready'`);
      }
    } else {
      console.warn(`[sync-engine] [Profiling] WARNING: Sync verification failed for ${repoId} in ${durationMs}ms. Reason: ${verification.reason}`);
      await supabase
        .from("repositories")
        .update({ 
          verification_status: "failed",
          verification_reason: verification.reason,
          error_message: null,
          ...(shouldTransitionToReady ? { status: "failed" } : {})
        })
        .eq("id", repoId);

      if (shouldTransitionToReady) {
        console.log(`[sync-engine] Terminated state machine: Transitioned ${repoId} to 'failed'`);
      }
    }

    if (runId) {
      const totalDuration = tPipelineStart ? Math.round(performance.now() - tPipelineStart) : null;
      await supabase
        .from("repository_pipeline_runs")
        .update({
          verification_duration_ms: durationMs,
          total_duration_ms: totalDuration,
          completed_at: new Date().toISOString(),
          status: "completed"
        })
        .eq("id", runId);
    }

  } catch (err) {
    console.error(`[sync-engine] Verification threw error for ${repoId}:`, err);
    await supabase
      .from("repositories")
      .update({ 
        verification_status: "failed",
        verification_reason: `Fatal error: ${err instanceof Error ? err.message : String(err)}`,
        ...(shouldTransitionToReady ? { status: "failed" } : {})
      })
      .eq("id", repoId);
      
    if (shouldTransitionToReady) {
      console.log(`[sync-engine] Terminated state machine due to exception: Transitioned ${repoId} to 'failed'`);
    }
      
    if (runId) {
      await supabase
        .from("repository_pipeline_runs")
        .update({
          status: "failed",
          error_message: `Verification fatal error: ${err instanceof Error ? err.message : String(err)}`,
          completed_at: new Date().toISOString()
        })
        .eq("id", runId);
    }
  }
}
