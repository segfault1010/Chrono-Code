import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";
import { createAppError } from "../middleware/error-handler";
import type { Commit, CommitFile, FileChangeType } from "@chronocode/shared-types";
import { randomUUID } from "crypto";

const execAsync = promisify(exec);

// Custom delimiter that won't appear in commit messages
const COMMIT_START = "|||||COMMIT_START|||||";
const COMMIT_END = "|||||COMMIT_END|||||";

const GIT_LOG_FORMAT = [
  COMMIT_START,
  "%H", "%P", "%an", "%ae", "%aI", "%cn", "%ce", "%cI", "%B",
  COMMIT_END
].join("%n");

export interface ParsedCommit {
  commit: Omit<Commit, "id" | "repo_id" | "created_at">;
  files: Omit<CommitFile, "id" | "commit_id">[];
}

/**
 * Parse all commits from the repository (up to `limit`).
 * Used for the initial full-history parse. For incremental work, use parseCommitPage.
 */
export async function parseCommitHistory(
  repoPath: string,
  limit: number = 50000
): Promise<ParsedCommit[]> {
  try {
    const cmd = `git log --max-count=${limit} --format="${GIT_LOG_FORMAT}"`;
    
    // increase maxBuffer to 100MB to handle large repo logs
    const { stdout } = await execAsync(cmd, { cwd: repoPath, maxBuffer: 1024 * 1024 * 100 });
    
    return parseGitLogOutput(stdout);
  } catch (err) {
    console.error("[chronocode-api] Error parsing git log:", err);
    throw createAppError("Failed to parse repository commit history", 500, String(err));
  }
}

/**
 * Parse a single page of commits using --skip and --max-count.
 * This allows incremental, memory-efficient processing of large repositories.
 * 
 * @param repoPath - Path to the bare git repository
 * @param skip - Number of commits to skip from HEAD (0-based)
 * @param pageSize - Number of commits to retrieve in this page
 * @returns Array of parsed commits for this page
 */
export async function parseCommitPage(
  repoPath: string,
  skip: number,
  pageSize: number
): Promise<ParsedCommit[]> {
  try {
    const cmd = `git log --skip=${skip} --max-count=${pageSize} --format="${GIT_LOG_FORMAT}"`;
    
    // 10MB buffer is sufficient for a single page of commits
    const { stdout } = await execAsync(cmd, { cwd: repoPath, maxBuffer: 1024 * 1024 * 10 });
    
    if (!stdout.trim()) {
      return []; // No more commits
    }
    
    return parseGitLogOutput(stdout);
  } catch (err) {
    console.error(`[chronocode-api] Error parsing commit page (skip=${skip}, size=${pageSize}):`, err);
    throw createAppError("Failed to parse commit page", 500, String(err));
  }
}

/**
 * Parse commits that are newer than a given SHA.
 * Used by the sync job to fetch only new commits since last sync.
 * 
 * @param repoPath - Path to the bare git repository
 * @param sinceSha - The SHA to start from (exclusive — commits after this SHA)
 * @returns Array of parsed commits newer than sinceSha
 */
export async function parseCommitsSince(
  repoPath: string,
  sinceSha: string
): Promise<ParsedCommit[]> {
  try {
    const cmd = `git log ${sinceSha}..HEAD --format="${GIT_LOG_FORMAT}"`;
    
    const { stdout } = await execAsync(cmd, { cwd: repoPath, maxBuffer: 1024 * 1024 * 50 });
    
    if (!stdout.trim()) {
      return []; // No new commits
    }
    
    return parseGitLogOutput(stdout);
  } catch (err) {
    console.error(`[chronocode-api] Error parsing commits since ${sinceSha}:`, err);
    // If the SHA doesn't exist (e.g., force push), fall back to empty
    return [];
  }
}

function parseGitLogOutput(output: string): ParsedCommit[] {
  const parsedCommits: ParsedCommit[] = [];
  
  // Split the output by COMMIT_START to isolate each commit block
  const blocks = output.split(COMMIT_START).filter(b => b.trim());
  
  for (const block of blocks) {
    const endIdx = block.indexOf(COMMIT_END);
    if (endIdx === -1) continue;
    
    const metadataStr = block.substring(0, endIdx).trim();
    
    const metaLines = metadataStr.split("\n");
    if (metaLines.length < 8) continue;
    
    const sha = metaLines[0] || "";
    const parent_shas = (metaLines[1] || "").split(" ").filter(Boolean);
    const author_name = metaLines[2] || "";
    const author_email = metaLines[3] || "";
    const authored_at = metaLines[4] || "";
    const committer_name = metaLines[5] || "";
    const committer_email = metaLines[6] || "";
    const committed_at = metaLines[7] || "";
    
    // The rest of the metadata lines form the commit message
    const message = metaLines.slice(8).join("\n").trim();
    
    // Fast path: We skip calculating file diffs entirely to allow instant loading of massive repositories.
    // The exact diff is only fetched dynamically when the user clicks 'AI Explain' on a specific commit.
    parsedCommits.push({
      commit: {
        sha,
        message,
        author_name,
        author_email,
        authored_at,
        committer_name,
        committer_email,
        committed_at,
        parent_shas,
        files_changed: 0,
        insertions: 0,
        deletions: 0
      },
      files: []
    });
  }
  
  return parsedCommits;
}
