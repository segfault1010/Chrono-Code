import simpleGit from "simple-git";
import * as path from "path";
import * as fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import { createAppError } from "../middleware/error-handler";

const execAsync = promisify(exec);
const CLONE_BASE_PATH = process.env.CLONE_BASE_PATH || "./tmp/clones";

export async function validateGithubUrl(url: string): Promise<{ owner: string; name: string }> {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "github.com") {
      throw new Error();
    }
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length !== 2) {
      throw new Error();
    }
    const owner = parts[0];
    const name = parts[1];
    if (!owner || !name) {
      throw new Error();
    }
    return { owner, name: name.replace(/\.git$/, "") };
  } catch (err) {
    throw createAppError("Invalid GitHub URL. Must be like https://github.com/owner/repo", 400);
  }
}

export async function cloneRepo(url: string, githubToken?: string): Promise<string> {
  const { owner, name } = await validateGithubUrl(url);
  // Resolve against api directory root, assuming cwd is apps/api
  const targetDir = path.resolve(process.cwd(), CLONE_BASE_PATH, owner, name);
  
  await fs.mkdir(targetDir, { recursive: true });

  const git = simpleGit();
  
  try {
    const gitVerify = simpleGit(targetDir);
    const isBare = await gitVerify.revparse(["--is-bare-repository"]);
    if (isBare.trim() === "true") {
      // It's a valid bare repo, fetch the latest commits
      console.log(`[chronocode-api] Repo exists locally. Fetching latest...`);
      try {
        await gitVerify.fetch(["origin", "+refs/heads/*:refs/heads/*", "--prune"]);
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
    console.log(`[chronocode-api] Cloning ${url} to ${targetDir}...`);
    // Inject token for private repos
    let cloneUrl = url;
    if (githubToken) {
      cloneUrl = url.replace("https://", `https://${githubToken}@`);
    }

    // bare clone saves space and time, and allows getting diffs via git show
    // --filter=blob:none performs a blobless clone — downloads commit/tree objects only, no file blobs.
    //   This keeps the clone fast even for massive repos (e.g., linux kernel)
    // --single-branch ensures we don't fetch all branches/tags
    // NOTE: We do NOT use --depth here. Full history is required for progressive indexing.
    //   The blobless filter keeps it fast — ~5-8s for facebook/react (26k commits).
    await git.clone(cloneUrl, targetDir, ["--bare", "--single-branch", "--filter=blob:none"]);
    console.log(`[chronocode-api] Clone complete for ${url}`);
  } catch (err) {
    // Cleanup on failure
    await fs.rm(targetDir, { recursive: true, force: true }).catch(() => {});
    throw createAppError("Failed to clone repository. Is it public or do you lack permissions?", 400, String(err));
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
