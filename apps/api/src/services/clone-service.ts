import simpleGit from "simple-git";
import * as path from "path";
import * as fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import { createAppError } from "../middleware/error-handler";

const execAsync = promisify(exec);
const CLONE_BASE_PATH = "/tmp/chronocode";

export async function validateGithubUrl(rawUrl: string): Promise<{ owner: string; name: string; normalizedUrl: string }> {
  console.log(`[Validation] Raw input: "${rawUrl}"`);
  
  try {
    let url = rawUrl.trim();
    
    // Remove invisible characters/whitespace just in case
    url = url.replace(/[\u200B-\u200D\uFEFF]/g, '');

    // Normalize input
    if (!url.includes("github.com")) {
      // It might be just owner/repo
      url = `https://github.com/${url}`;
    } else if (!/^https?:\/\//i.test(url)) {
      // It has github.com but no protocol
      url = `https://${url}`;
    }

    console.log(`[Validation] Normalized URL: "${url}"`);

    const parsed = new URL(url);
    if (parsed.hostname !== "github.com") {
      throw new Error(`Hostname is not github.com (found ${parsed.hostname})`);
    }
    
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 2) {
      throw new Error(`Path does not have at least 2 parts (found ${parts.length})`);
    }
    
    const owner = parts[0] ?? "";
    const rawName = parts[1] ?? "";
    const name = rawName.replace(/\.git$/, "");
    
    if (!owner || !name) {
      throw new Error("Owner or name is empty");
    }
    
    console.log(`[Validation] Extracted - Owner: "${owner}", Repository: "${name}"`);
    console.log(`[Validation] Result: SUCCESS`);
    
    return { owner, name, normalizedUrl: url };
  } catch (err: any) {
    console.log(`[Validation] Result: FAILED - ${err.message}`);
    throw createAppError("Invalid GitHub URL. Must be like https://github.com/owner/repo", 400);
  }
}

export async function cloneRepo(url: string, githubToken?: string): Promise<string> {
  const { owner, name, normalizedUrl } = await validateGithubUrl(url);
  // Resolve against CLONE_BASE_PATH directly
  const targetDir = path.resolve(CLONE_BASE_PATH, owner, name);
  
  await fs.mkdir(targetDir, { recursive: true });

  const git = simpleGit();
  
  try {
    const gitVerify = simpleGit(targetDir);
    const isBare = await gitVerify.revparse(["--is-bare-repository"]);
    if (isBare.trim() === "true") {
      // It's a valid bare repo, fetch the latest commits
      console.log(`[chronocode-api] Repo exists locally. Fetching latest...`);
      try {
        const isShallow = await gitVerify.revparse(["--is-shallow-repository"]).catch(() => "false");
        const fetchArgs = ["origin", "+refs/heads/*:refs/heads/*", "--prune"];
        if (isShallow.trim() === "true") {
          console.log(`[chronocode-api] Unshallowing repository...`);
          fetchArgs.push("--unshallow");
        }
        await gitVerify.fetch(fetchArgs);
      } catch(e) {
        console.warn(`[chronocode-api] Failed to fetch latest, continuing with local...`);
      }
      return targetDir;
    }
  } catch (e) {
    // Directory is invalid or corrupt, clean it up for re-cloning
    await fs.rm(targetDir, { recursive: true, force: true }).catch(() => {});
  }

  try {
    console.log(`[chronocode-api] Cloning ${normalizedUrl} to ${targetDir}...`);
    // Inject token for private repos
    let cloneUrl = normalizedUrl;
    if (githubToken) {
      cloneUrl = normalizedUrl.replace("https://", `https://${githubToken}@`);
    }

    // bare clone saves space and time, and allows getting diffs via git show
    // --filter=blob:none performs a blobless clone — downloads commit/tree objects only, no file blobs.
    //   This keeps the clone fast even for massive repos (e.g., linux kernel)
    // --single-branch ensures we don't fetch all branches/tags
    // NOTE: We do NOT use --depth here. Full history is required for progressive indexing.
    //   The blobless filter keeps it fast — ~5-8s for facebook/react (26k commits).
    await git.clone(cloneUrl, targetDir, ["--bare", "--single-branch", "--filter=blob:none"]);
    console.log(`[chronocode-api] Clone complete for ${url}`);
  } catch (err: any) {
    // Cleanup on failure
    await fs.rm(targetDir, { recursive: true, force: true }).catch(() => {});
    
    // Gather diagnostic information
    let diagnosticInfo = `[CLONE_ERROR_DIAGNOSTICS]\n`;
    diagnosticInfo += `Original Error: ${err?.message || String(err)}\n`;
    diagnosticInfo += `Repository URL: ${url}\n`;
    diagnosticInfo += `Clone Destination: ${targetDir}\n`;
    diagnosticInfo += `Working Directory: ${process.cwd()}\n`;
    
    // Check if destination is writable
    try {
      await fs.access(path.dirname(targetDir), fs.constants.W_OK);
      diagnosticInfo += `Destination Writable: YES\n`;
    } catch {
      diagnosticInfo += `Destination Writable: NO\n`;
    }

    // Check if git is available
    try {
      const gitVer = await execAsync("git --version");
      diagnosticInfo += `Git Available: YES (${gitVer.stdout.trim()})\n`;
    } catch (gitErr: any) {
      diagnosticInfo += `Git Available: NO (${gitErr.message})\n`;
    }

    const safeUrl = cloneUrl.replace(/https:\/\/[^@]+@/, "https://***@");
    diagnosticInfo += `Command Attempted: git clone ${safeUrl} ${targetDir} --bare --single-branch --filter=blob:none\n`;
    diagnosticInfo += `Exit Code: ${err?.code || 'Unknown'}\n`;
    diagnosticInfo += `Stdout: ${err?.stdout || 'None'}\n`;
    diagnosticInfo += `Stderr: ${err?.stderr || 'None'}\n`;
    diagnosticInfo += `Stack: ${err?.stack || 'None'}\n`;
    
    console.error(diagnosticInfo);

    throw createAppError(`Git Clone Failed: ${err?.message || String(err)}\n\nDiagnostics:\n${diagnosticInfo}`, 500);
  }

  return targetDir;
}

/**
 * Get the total number of commits in the repository using `git rev-list --count HEAD`.
 * This is extremely fast even for massive repos because it only counts commit objects
 * (which are already downloaded by the blobless clone).
 */
export async function getCommitCount(repoPath: string): Promise<number> {
  try {
    const { stdout } = await execAsync("git rev-list --count HEAD", { cwd: repoPath });
    return parseInt(stdout.trim(), 10) || 0;
  } catch (err) {
    console.error("[chronocode-api] Failed to get commit count:", err);
    return 0;
  }
}

/**
 * Get the default branch name for the repository.
 */
export async function getDefaultBranch(repoPath: string): Promise<string> {
  try {
    const { stdout } = await execAsync("git symbolic-ref HEAD", { cwd: repoPath });
    // Returns something like "refs/heads/main" — extract "main"
    return stdout.trim().replace("refs/heads/", "");
  } catch (err) {
    return "main"; // Fallback
  }
}

/**
 * Fetch latest commits from origin (for sync operations).
 * Returns the repo path for chaining.
 */
export async function fetchLatest(repoPath: string, githubToken?: string): Promise<string> {
  try {
    const git = simpleGit(repoPath);
    await git.fetch(["origin", "+refs/heads/*:refs/heads/*", "--prune"]);
  } catch (err) {
    console.warn("[chronocode-api] Failed to fetch latest:", err);
  }
  return repoPath;
}
