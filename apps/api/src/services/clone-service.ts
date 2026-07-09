import simpleGit from "simple-git";
import * as path from "path";
import * as fs from "fs/promises";
import { createAppError } from "../middleware/error-handler";

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

export async function cloneRepo(url: string): Promise<string> {
  const { owner, name } = await validateGithubUrl(url);
  // Resolve against api directory root, assuming cwd is apps/api
  const targetDir = path.resolve(process.cwd(), CLONE_BASE_PATH, owner, name);
  
  await fs.mkdir(targetDir, { recursive: true });

  const git = simpleGit();
  
  try {
    const gitVerify = simpleGit(targetDir);
    const isBare = await gitVerify.revParse(["--is-bare-repository"]);
    if (isBare.trim() === "true") {
      // It's a valid bare repo
      return targetDir;
    }
  } catch (e) {
    // Directory is invalid or corrupt, clean it up for re-cloning
    await fs.rm(targetDir, { recursive: true, force: true }).catch(() => {});
  }

  try {
    console.log(`[chronocode-api] Cloning ${url} to ${targetDir}...`);
    // bare clone saves space and time, and allows getting diffs via git show
    // --filter=blob:none performs a blobless clone which is incredibly fast for large repos
    // --single-branch ensures we don't fetch all branches/tags, making it take <2s even for facebook/react
    await git.clone(url, targetDir, ["--bare", "--single-branch", "--filter=blob:none", "--depth=100"]);
    console.log(`[chronocode-api] Clone complete for ${url}`);
  } catch (err) {
    // Cleanup on failure
    await fs.rm(targetDir, { recursive: true, force: true }).catch(() => {});
    throw createAppError("Failed to clone repository. Is it public?", 400, String(err));
  }

  return targetDir;
}
