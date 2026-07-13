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
      id: randomUUID(),
      repo_id: repoId,
      ...pc.commit
    }));
    
    // Insert commits
    const { error: commitError } = await supabase
      .from("commits")
      .insert(commitsToInsert);
      
    if (commitError) {
      console.error(`[sync-engine] Bulk insert error at chunk ${i}:`, commitError);
      throw new Error(`Failed to insert commits: ${commitError.message}`);
    }

    // Insert files
    const filesToInsert = [];
    for (let j = 0; j < chunk.length; j++) {
      const commitId = commitsToInsert[j]!.id;
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
