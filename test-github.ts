import { fetchGithubCommitCount } from "./apps/api/src/services/github-service";

async function run() {
  const count = await fetchGithubCommitCount("https://github.com/expressjs/express");
  console.log("Express commit count:", count);
}

run().catch(console.error);
