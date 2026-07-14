import { supabase } from "../lib/db";
import { generateRepositoryJourney } from "./journey-service";

export type AnalyticsType = "journey" | "contributors" | "activity" | "evolution";

export async function queueAnalyticsGeneration(repoId: string, types: AnalyticsType[], latestSha: string) {
  const rows = types.map(type => ({
    repo_id: repoId,
    analytics_type: type,
    last_commit_sha: latestSha,
    status: 'queued',
  }));

  console.log(`[analytics-pipeline] Job queued: Queuing analytics [${types.join(', ')}] for repo ${repoId}`);

  const { error } = await supabase
    .from("repository_analytics")
    .upsert(rows, { onConflict: "repo_id, analytics_type" });

  if (error) {
    console.error(`[analytics-pipeline] Failed to queue analytics for repo ${repoId}:`, error);
  } else {
    console.log(`[analytics-pipeline] Successfully queued analytics generation for repo ${repoId}`);
  }
}

export async function getCachedAnalytics(repoId: string, type: AnalyticsType) {
  // Get repository's current latest sha
  const { data: repo, error: repoErr } = await supabase
    .from("repositories")
    .select("last_indexed_sha")
    .eq("id", repoId)
    .single();

  if (repoErr || !repo) {
    throw new Error(`Repository not found or error fetching repo: ${repoErr?.message}`);
  }

  // Get cached analytics
  const { data: cached, error: cacheErr } = await supabase
    .from("repository_analytics")
    .select("*")
    .eq("repo_id", repoId)
    .eq("analytics_type", type)
    .maybeSingle();

  if (cacheErr) {
    console.error(`[analytics-pipeline] Error fetching cache for ${type}:`, cacheErr);
  }

  const currentSha = repo.last_indexed_sha || "unknown";

  // If missing or outdated, queue it if it's not already computing/queued
  if (!cached) {
    console.log(`[analytics-pipeline] Cache missing for ${type}, queuing generation.`);
    await queueAnalyticsGeneration(repoId, [type], currentSha);
    return { data: type === 'journey' ? {} : [], status: 'pending' };
  }

  let status = cached.status;
  if (cached.last_commit_sha !== currentSha && status !== 'computing' && status !== 'queued') {
    console.log(`[analytics-pipeline] Cache outdated for ${type}, queuing generation.`);
    status = 'outdated';
    await queueAnalyticsGeneration(repoId, [type], currentSha);
  }

  return {
    data: cached.data,
    status: status,
    generated_at: cached.generated_at,
    analytics_version: cached.analytics_version,
    error_message: cached.error_message
  };
}

export async function computeAnalytics(repoId: string, type: AnalyticsType, latestSha: string) {
  console.log(`[analytics-pipeline] Analytics computation started for ${type} (Repo: ${repoId})`);
  
  let data: any = null;
  const version = 1; // Current analytics version

  try {
    switch (type) {
      case "journey":
        console.log(`[analytics-pipeline] Generating journey...`);
        data = await generateRepositoryJourney(repoId);
        break;
      
      case "contributors":
        console.log(`[analytics-pipeline] Fetching top contributors...`);
        const { data: contribs, error: cErr } = await supabase.rpc("get_top_contributors", { match_repo_id: repoId, limit_count: 50 });
        if (cErr) throw cErr;
        data = contribs || [];
        break;
        
      case "activity":
        console.log(`[analytics-pipeline] Fetching commit activity...`);
        const { data: activity, error: aErr } = await supabase.rpc("get_commit_activity", { match_repo_id: repoId, days_limit: 365 });
        if (aErr) throw aErr;
        data = activity || [];
        break;
        
      case "evolution":
        console.log(`[analytics-pipeline] Fetching code evolution...`);
        const { data: evo, error: eErr } = await supabase
          .rpc("get_sampled_evolution", { match_repo_id: repoId, max_samples: 1000 });
        if (eErr) throw eErr;
        data = evo || [];
        break;
        
      default:
        throw new Error(`Unknown analytics type: ${type}`);
    }

    console.log(`[analytics-pipeline] Analytics computation completed for ${type}. Writing to cache...`);

    const { error: updateErr } = await supabase
      .from("repository_analytics")
      .update({
        data,
        status: "ready",
        last_commit_sha: latestSha,
        analytics_version: version,
        generated_at: new Date().toISOString(),
        error_message: null
      })
      .eq("repo_id", repoId)
      .eq("analytics_type", type);
      
    if (updateErr) {
      console.error(`[analytics-pipeline] Cache write failed for ${type}:`, updateErr);
      throw updateErr;
    }
    
    console.log(`[analytics-pipeline] Cache written. Status updated to 'ready' for ${type} (Repo: ${repoId})`);

  } catch (error) {
    const error_message = error instanceof Error ? error.message : String(error);
    console.error(`[analytics-pipeline] Failed to compute ${type} for repo ${repoId}:`, error_message, error);
    
    console.log(`[analytics-pipeline] Updating status to 'failed' for ${type}...`);
    const { error: failErr } = await supabase
      .from("repository_analytics")
      .update({
        status: "failed",
        error_message
      })
      .eq("repo_id", repoId)
      .eq("analytics_type", type);
      
    if (failErr) {
      console.error(`[analytics-pipeline] Failed to update status to 'failed' for ${type}:`, failErr);
    }
  }
}
