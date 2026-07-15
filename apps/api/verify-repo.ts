import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, ".env") });

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Error: SUPABASE_URL or SUPABASE_ANON_KEY is not defined in environment variables.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function verifyRepo(repoId: string) {
  console.log(`Verifying repo ${repoId}...`);
  
  const { data: repo, error: repoError } = await supabase
    .from('repositories')
    .select('*')
    .eq('id', repoId)
    .single();
    
  if (repoError) {
    console.error("Error fetching repo:", repoError);
    return;
  }
  
  console.log(`Repo Name: ${repo.owner}/${repo.name}`);
  
  // 1. Local Git commit count
  const clonePath = path.resolve(process.cwd(), "./tmp/clones", repo.owner, repo.name);
  let localCommitCount = 0;
  let localHeadSha = "";
  try {
    localCommitCount = parseInt(execSync(`git rev-list --count HEAD`, { cwd: clonePath }).toString().trim());
    localHeadSha = execSync(`git rev-parse HEAD`, { cwd: clonePath }).toString().trim();
  } catch (err) {
    console.log("Could not read local git repository at", clonePath);
  }
  
  // 2. Database commit count
  const { count: dbCommitCount, error: countError } = await supabase
    .from('commits')
    .select('id', { count: 'exact', head: true })
    .eq('repo_id', repoId);
    
  // 3. COUNT(DISTINCT sha)
  // We can't do DISTINCT in supabase-js easily, let's fetch all SHAs
  const { data: shas } = await supabase
    .from('commits')
    .select('sha')
    .eq('repo_id', repoId);
  const distinctShas = new Set(shas?.map(c => c.sha)).size;
  
  // 4. Database HEAD SHA
  // Fetch latest commit by date
  const { data: latestCommit } = await supabase
    .from('commits')
    .select('sha')
    .eq('repo_id', repoId)
    .order('authored_at', { ascending: false })
    .limit(1)
    .single();
    
  console.log("-----------------------------------------");
  console.log(`Local Git commit count: ${localCommitCount}`);
  console.log(`Database commit count : ${dbCommitCount}`);
  console.log(`COUNT(DISTINCT sha)   : ${distinctShas}`);
  console.log(`Local HEAD SHA        : ${localHeadSha}`);
  console.log(`Database HEAD SHA     : ${latestCommit?.sha || 'None'}`);
  console.log(`Repo object HEAD SHA  : ${repo.last_indexed_sha}`);
  console.log(`GitHub API count      : ${repo.total_commits}`);
  console.log("-----------------------------------------");
  
  let failedRule = null;
  if (localCommitCount > 0 && dbCommitCount !== localCommitCount) {
    failedRule = `DB commits (${dbCommitCount}) != Local Git commits (${localCommitCount})`;
  } else if (dbCommitCount !== distinctShas) {
    failedRule = `Duplicate SHAs detected! DB commits (${dbCommitCount}) != Distinct SHAs (${distinctShas})`;
  } else if (localHeadSha && latestCommit?.sha && localHeadSha !== latestCommit.sha && localHeadSha !== repo.last_indexed_sha) {
    failedRule = `HEAD mismatch! Local: ${localHeadSha}, DB Latest: ${latestCommit.sha}, Repo Last Indexed: ${repo.last_indexed_sha}`;
  } else if (repo.total_commits > 0 && dbCommitCount < repo.total_commits) {
     failedRule = `DB commits (${dbCommitCount}) < GitHub API reports (${repo.total_commits})`;
  }
  
  if (failedRule) {
    console.log(`VERIFICATION FAILED!`);
    console.log(`Exact rule failed: ${failedRule}`);
  } else {
    console.log(`VERIFICATION SUCCESSFUL.`);
  }
}

const args = process.argv.slice(2);
if (args[0]) {
  verifyRepo(args[0]);
} else {
  console.log("Please provide a repo ID");
}
