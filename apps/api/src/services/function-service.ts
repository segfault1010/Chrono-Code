import simpleGit from "simple-git";
import { createAppError } from "../middleware/error-handler";
import type { FunctionHistoryNode } from "@chronocode/shared-types/src/api";

export async function getFunctionHistory(repoPath: string, filePath: string, functionName: string): Promise<FunctionHistoryNode[]> {
  const git = simpleGit(repoPath);
  
  let rawOutput = "";
  try {
    rawOutput = await git.raw([
      "log",
      "-p",
      "-L", `:${functionName}:${filePath}`,
      "--no-merges",
      "--date=iso-strict"
    ]);
  } catch (err: any) {
    console.error("[function-service] Error running git log -L:", err);
    // git log -L fails with exit code 128 if the file or function doesn't exist
    throw createAppError(`Could not trace function '${functionName}' in '${filePath}'. Ensure the file exists and Git can detect the function.`, 400);
  }

  return parseGitLogL(rawOutput);
}

function parseGitLogL(raw: string): FunctionHistoryNode[] {
  const commits: FunctionHistoryNode[] = [];
  
  // A commit block in git log starts with "commit <sha>"
  const blocks = raw.split(/^commit /m).filter(b => b.trim().length > 0);
  
  for (const block of blocks) {
    const lines = block.split('\n');
    const sha = lines[0]?.trim() || "";
    
    let author_name = "Unknown";
    let authored_at = "";
    let messageLines: string[] = [];
    let patchLines: string[] = [];
    
    let isHeader = true;
    let isMessage = false;
    let isPatch = false;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) continue;
      
      if (isHeader) {
        if (line.startsWith("Author:")) {
          // Author: Name <email>
          const match = line.match(/^Author:\s+(.+?)\s*<.*>$/);
          if (match) author_name = match[1]?.trim() || "Unknown";
          continue;
        }
        if (line.startsWith("Date:")) {
          const match = line.match(/^Date:\s+(.+)$/);
          if (match) authored_at = match[1]?.trim() || "";
          continue;
        }
        if (line === "") {
          isHeader = false;
          isMessage = true;
          continue;
        }
      } else if (isMessage) {
        if (line.startsWith("diff --git")) {
          isMessage = false;
          isPatch = true;
          patchLines.push(line);
          continue;
        }
        // Commit messages in git log are usually indented by 4 spaces
        if (line.startsWith("    ")) {
          messageLines.push(line.substring(4));
        } else if (line.trim() !== "") {
          messageLines.push(line);
        }
      } else if (isPatch) {
        patchLines.push(line);
      }
    }
    
    commits.push({
      sha,
      author_name,
      authored_at,
      message: messageLines.join('\n').trim(),
      patch: patchLines.join('\n').trim()
    });
  }
  
  return commits;
}
