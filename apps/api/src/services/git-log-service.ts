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

export async function parseCommitHistory(
  repoPath: string,
  limit: number = 50000
): Promise<ParsedCommit[]> {
  try {
    const cmd = `git log --max-count=${limit} --format="${GIT_LOG_FORMAT}" --numstat`;
    
    // increase maxBuffer to 100MB to handle large repo logs
    const { stdout } = await execAsync(cmd, { cwd: repoPath, maxBuffer: 1024 * 1024 * 100 });
    
    return parseGitLogOutput(stdout);
  } catch (err) {
    console.error("[chronocode-api] Error parsing git log:", err);
    throw createAppError("Failed to parse repository commit history", 500, String(err));
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
    const numstatStr = block.substring(endIdx + COMMIT_END.length).trim();
    
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
    
    // Parse numstat lines
    const files: ParsedCommit["files"] = [];
    let insertionsCount = 0;
    let deletionsCount = 0;
    
    const statLines = numstatStr.split("\n").filter(l => l.trim());
    for (const line of statLines) {
      const parts = line.split("\t");
      if (parts.length >= 3) {
        // Numstat format: "insertions \t deletions \t path"
        // Binary files show "-" for insertions/deletions
        const ins = parts[0] === "-" ? 0 : parseInt(parts[0] || "0", 10);
        const del = parts[1] === "-" ? 0 : parseInt(parts[1] || "0", 10);
        const path = parts.slice(2).join("\t").trim();
        
        insertionsCount += ins;
        deletionsCount += del;
        
        files.push({
          file_path: path,
          change_type: "M", // --numstat doesn't give us the change type reliably, assuming M for V1
          insertions: ins,
          deletions: del
        });
      }
    }
    
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
        files_changed: files.length,
        insertions: insertionsCount,
        deletions: deletionsCount
      },
      files
    });
  }
  
  return parsedCommits;
}
