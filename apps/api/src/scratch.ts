import { cloneRepo } from "./services/clone-service";
import { parseCommitHistory } from "./services/git-log-service";
import { getCommitDiff } from "./services/diff-service";

async function run() {
  const url = "https://github.com/expressjs/express";
  try {
    console.log("1. Cloning repository...");
    const targetDir = await cloneRepo(url);
    console.log("Target dir:", targetDir);
    
    console.log("\n2. Parsing commit history (limit 2)...");
    const commits = await parseCommitHistory(targetDir, 2);
    console.log("Commits parsed:", commits.length);
    if (commits.length > 0) {
      console.log("First commit message:", commits[0]?.commit.message);
      console.log("First commit files:", JSON.stringify(commits[0]?.files, null, 2));
      
      console.log("\n3. Fetching diff for first commit...");
      const diff = await getCommitDiff(targetDir, commits[0]!.commit.sha);
      console.log("Diff length:", diff.length);
      console.log("Preview:\n" + diff.substring(0, 300));
    }
  } catch (err) {
    console.error(err);
  }
}

run();
