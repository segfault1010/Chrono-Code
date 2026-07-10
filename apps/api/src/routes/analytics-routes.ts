import { Router } from "express";
import { supabase } from "../lib/db";
import { createAppError } from "../middleware/error-handler";

export const analyticsRoutes = Router({ mergeParams: true });

// GET /api/repos/:id/analytics — Get repository analytics
analyticsRoutes.get("/", async (req, res, next) => {
  try {
    const { id } = req.params;

    // 1. Get total commits and unique contributors count
    const { data: totalCommits, error: totalError } = await supabase
      .from("commits")
      .select("sha", { count: "exact", head: true })
      .eq("repo_id", id);
      
    if (totalError) throw totalError;

    // We can't do COUNT(DISTINCT author_name) in postgrest easily without RPC, 
    // but we can just use the top contributors to approximate or leave it out.
    
    // 2. Get top contributors
    const { data: contributors, error: contribError } = await supabase
      .rpc("get_top_contributors", { match_repo_id: id, limit_count: 10 });
      
    if (contribError) throw contribError;

    // 3. Get activity timeline (last 30 days)
    const { data: activity, error: actError } = await supabase
      .rpc("get_commit_activity", { match_repo_id: id, days_limit: 30 });

    if (actError) throw actError;

    res.json({
      totalCommits: totalCommits || 0,
      topContributors: contributors || [],
      activityTimeline: activity || [],
    });
  } catch (err) {
    next(err);
  }
});
