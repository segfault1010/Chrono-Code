import { supabase } from "../apps/api/src/lib/db";
import { fetchGithubCommitCount } from "../apps/api/src/services/github-service";

async function repairCommitCounts() {
  console.log("[repair-commit-counts] Starting database repair...");
  
  // 1. Fetch all repositories
  const { data: repos, error: fetchError } = await supabase
    .from("repositories")
    .select("id, name, owner, indexed_commits, total_commits, status");
    
  if (fetchError) {
    console.error("[repair-commit-counts] Failed to fetch repositories:", fetchError);
    process.exit(1);
  }
  
  console.log(`[repair-commit-counts] Found ${repos.length} repositories to check.`);
  let repairedCount = 0;

  for (const repo of repos) {
    try {
      const url = `https://github.com/${repo.owner}/${repo.name}`;
      
      // Fetch the true count using the fixed github-service
      const trueTotal = await fetchGithubCommitCount(url);
      
      const actualIndexed = repo.indexed_commits || 0;
      let finalStatus = repo.status;
      
      // Repair if total_commits is wrong (e.g. 1)
      if (repo.total_commits !== trueTotal) {
        console.log(`[repair-commit-counts] Repairing ${repo.owner}/${repo.name}: total_commits ${repo.total_commits} -> ${trueTotal}`);
        
        // If the repo was marked "ready" but actually has missing commits, demote to "indexing_history"
        if (finalStatus === "ready" && trueTotal > 0 && actualIndexed < trueTotal) {
          console.log(`[repair-commit-counts] Demoting status to 'indexing_history' (indexed: ${actualIndexed}, total: ${trueTotal})`);
          finalStatus = "indexing_history";
        }
        
        const finalProgress = trueTotal > 0 
          ? Math.min(Math.round((actualIndexed / Math.max(actualIndexed, trueTotal)) * 100 * 10) / 10, 100) 
          : 100;

        const { error: updateError } = await supabase
          .from("repositories")
          .update({
            total_commits: trueTotal,
            status: finalStatus,
            indexing_progress: finalProgress
          })
          .eq("id", repo.id);
          
        if (updateError) {
          console.error(`[repair-commit-counts] Failed to update ${repo.name}:`, updateError);
        } else {
          repairedCount++;
        }
      } else {
        console.log(`[repair-commit-counts] ${repo.owner}/${repo.name} is correct (${trueTotal})`);
      }
      
      // Rate limiting buffer
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err) {
      console.error(`[repair-commit-counts] Failed to process ${repo.name}:`, err);
    }
  }
  
  console.log(`[repair-commit-counts] Finished. Repaired ${repairedCount} repositories.`);
}

repairCommitCounts().catch(console.error);
