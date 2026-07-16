import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { supabase } from "../lib/db";
import { createAppError } from "../middleware/error-handler";
import { getCachedAnalytics } from "../services/analytics-pipeline";

export const analyticsRoutes = Router({ mergeParams: true });

// GET /api/analytics/:id — Get repository analytics
analyticsRoutes.get("/:id", async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const [contribRes, activityRes] = await Promise.all([
      getCachedAnalytics(id, "contributors"),
      getCachedAnalytics(id, "activity")
    ]);

    // We can just query total_commits from the repositories table or commits table instantly
    const { count: totalCommits } = await supabase
      .from("commits")
      .select("sha", { count: "exact", head: true })
      .eq("repo_id", id);

    // Merge metadata
    const statuses = [contribRes.status, activityRes.status];
    const overallStatus = statuses.includes("failed") ? "failed" 
                        : statuses.includes("queued") || statuses.includes("computing") ? "computing" 
                        : statuses.includes("outdated") ? "outdated" 
                        : "ready";

    const errorMessages = [contribRes.error_message, activityRes.error_message].filter(Boolean);

    res.json({
      totalCommits: totalCommits || 0,
      topContributors: Array.isArray(contribRes.data) ? contribRes.data : [],
      activityTimeline: Array.isArray(activityRes.data) ? activityRes.data : [],
      _meta: {
        status: overallStatus,
        generated_at: activityRes.generated_at, // Use one as reference
        analytics_version: activityRes.analytics_version,
        error_message: errorMessages.length > 0 ? errorMessages.join("; ") : null
      }
    });
  } catch (err) {
    next(err);
  }
});
