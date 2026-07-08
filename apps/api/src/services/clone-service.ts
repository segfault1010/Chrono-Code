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
    const stat = await fs.stat(path.join(targetDir, "config"));
    if (stat.isFile()) {
      // It's already cloned as a bare repo
      return targetDir;
    }
  } catch (e) {
    // Proceed to clone if config doesn't exist
  }

  try {
    console.log(`[chronocode-api] Cloning ${url} to ${targetDir}...`);
    // bare clone saves space and time, and allows getting diffs via git show
    await git.clone(url, targetDir, ["--bare"]);
    console.log(`[chronocode-api] Clone complete for ${url}`);
  } catch (err) {
    // Cleanup on failure
    await fs.rm(targetDir, { recursive: true, force: true }).catch(() => {});
    throw createAppError("Failed to clone repository. Is it public?", 400, String(err));
  }

  return targetDir;
}
