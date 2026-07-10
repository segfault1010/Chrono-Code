import { supabase } from "../lib/db";
import { cloneRepo, validateGithubUrl } from "../services/clone-service";
import { parseCommitHistory, ParsedCommit } from "../services/git-log-service";
import { randomUUID } from "crypto";

export async function startIndexingJob(repoId: string, url: string, githubToken?: string) {
  // Start job asynchronously. We don't await this in the route handler.
  runIndexingPipeline(repoId, url, githubToken).catch((err) => {
    console.error(`[chronocode-api] Indexing pipeline failed for ${repoId}:`, err);
  });
}

async function runIndexingPipeline(repoId: string, url: string, githubToken?: string) {
  try {
    // 1. Update status to cloning
    await updateRepoStatus(repoId, "cloning");

    // 2. Clone the repository
    const targetDir = await cloneRepo(url, githubToken);

    // 3. Update status to indexing
    await updateRepoStatus(repoId, "indexing");

    // 4. Parse commit history (Limited to 100 for instantaneous loading)
    console.log(`[chronocode-api] Parsing commit history for ${url}...`);
    const parsedCommits = await parseCommitHistory(targetDir, 100);
    console.log(`[chronocode-api] Parsed ${parsedCommits.length} commits for ${url}`);

    // 5. Bulk insert into Supabase
    // To avoid hitting payload limits, chunk the inserts
    await bulkInsertCommits(repoId, parsedCommits);

    // 6. Update status to ready
    await supabase
      .from("repositories")
      .update({
        status: "ready",
        total_commits: parsedCommits.length,
        indexed_commits: parsedCommits.length,
        last_indexed_at: new Date().toISOString(),
      })
      .eq("id", repoId);
      
    console.log(`[chronocode-api] Indexing complete for ${url}`);
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
  const CHUNK_SIZE = 500;
  
  for (let i = 0; i < parsedCommits.length; i += CHUNK_SIZE) {
    const chunk = parsedCommits.slice(i, i + CHUNK_SIZE);
    
    // Assign UUIDs to commits so we can link files
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
      console.error(`[chronocode-api] Bulk insert error at chunk ${i}:`, commitError);
      // If error is unique constraint violation (code 23505), it means commits already exist.
      // For V1, we can ignore duplicate errors if we assume idempotent re-indexing.
      if (commitError.code !== "23505") {
         throw new Error(`Failed to insert commits: ${commitError.message}`);
      }
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
      // Chunk files further as there could be many files per commit
      const FILE_CHUNK_SIZE = 2000;
      for (let k = 0; k < filesToInsert.length; k += FILE_CHUNK_SIZE) {
        const fileChunk = filesToInsert.slice(k, k + FILE_CHUNK_SIZE);
        const { error: fileError } = await supabase
          .from("commit_files")
          .insert(fileChunk);
          
        if (fileError) {
           console.error(`[chronocode-api] Bulk insert file error at file chunk ${k}:`, fileError);
           // Ignore file insert errors for already existing commits
        }
      }
    }
    
    console.log(`[chronocode-api] Inserted chunk ${i} to ${i + CHUNK_SIZE} of ${parsedCommits.length}`);
  }
}
