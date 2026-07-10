import { Router } from "express";
import { supabase } from "../lib/db";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth-middleware";

export const userRoutes = Router();

// GET /api/user/repos — Get the user's saved repositories
userRoutes.get("/repos", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user?.id;

    // We join the repositories table through saved_repositories
    const { data, error } = await supabase
      .from("saved_repositories")
      .select(`
        repositories (
          id,
          github_url,
          owner,
          name,
          default_branch,
          status,
          total_commits,
          indexed_commits,
          error_message,
          created_at,
          updated_at,
          last_indexed_at
        )
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Flatten the response
    const repos = data?.map(row => row.repositories) || [];

    res.json(repos);
  } catch (err) {
    next(err);
  }
});
