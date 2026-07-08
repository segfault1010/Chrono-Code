import { exec } from "child_process";
import { promisify } from "util";
import { createAppError } from "../middleware/error-handler";

const execAsync = promisify(exec);

// Maximum tokens ~2M for Gemini 1.5/2.0 Flash, but we want to cap diffs for latency and cost.
// ~4 characters per token roughly. A 100KB diff is ~25k tokens, very safe.
const MAX_DIFF_LENGTH = 100 * 1024; // 100KB

export async function getCommitDiff(repoPath: string, sha: string): Promise<string> {
  try {
    // get the diff for the specific commit.
    // In a bare repo, `git show <sha>` works and includes the diff.
    // We only want the patch, so --format=%B can be used or just standard show.
    // Actually, `git show --format= --patch <sha>` removes the message and just prints the diff.
    const cmd = `git show --format= --patch ${sha}`;
    
    const { stdout } = await execAsync(cmd, { cwd: repoPath, maxBuffer: 1024 * 1024 * 10 });
    
    let diff = stdout.trim();
    
    if (diff.length > MAX_DIFF_LENGTH) {
      diff = diff.substring(0, MAX_DIFF_LENGTH) + "\n\n... [DIFF TRUNCATED FOR SIZE] ...";
    }
    
    return diff;
  } catch (err) {
    console.error(`[chronocode-api] Error getting diff for ${sha}:`, err);
    throw createAppError(`Failed to retrieve diff for commit ${sha}`, 500, String(err));
  }
}
