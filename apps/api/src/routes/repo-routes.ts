// ============================================================================
// Repository Routes
// POST /api/repos       — Start indexing a new repository
// GET  /api/repos/:id   — Get repository status and metadata
// ============================================================================

import { Router } from "express";
import { supabase } from "../lib/db";
import { validateGithubUrl } from "../services/clone-service";
import { startIndexingJob } from "../jobs/index-repo-job";
import { semanticSearch } from "../services/search-service";
import { createAppError } from "../middleware/error-handler";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth-middleware";

export const repoRoutes = Router();

// GET /api/repos/:id/search — Semantic search for commits
repoRoutes.get("/:id/search", async (req, res, next) => {
  try {
    const { id } = req.params;
    const query = req.query.q as string;
    
    if (!query) {
      throw createAppError("Missing search query 'q'", 400);
    }
    
    const limit = parseInt(req.query.limit as string || "10", 10);
    
    // If query is exactly a 40-char SHA, just fetch that exact commit
    if (/^[0-9a-f]{40}$/i.test(query.trim())) {
      const { data: exactMatch } = await supabase
        .from("commits")
        .select("*")
        .eq("repo_id", id)
        .eq("sha", query.trim())
        .maybeSingle();
      
      if (exactMatch) {
        return res.json([ { ...exactMatch, similarity: 1 } ]);
      }
    }

    const matches = await semanticSearch(id, query, limit);
    
    res.json(matches);
  } catch (err) {
    next(err);
  }
});

// POST /api/repos — Start indexing a new repository
repoRoutes.post("/", async (req, res, next) => {
  try {
    const { url } = req.body;
    const githubToken = req.headers["x-github-token"] as string | undefined;

    if (!url || typeof url !== "string") {
      throw createAppError("Missing or invalid 'url' in request body", 400);
    }

    const { owner, name } = await validateGithubUrl(url);

    // Idempotency: Check if repository already exists
    const { data: existingRepo, error: findError } = await supabase
      .from("repositories")
      .select("*")
      .eq("github_url", url)
      .maybeSingle();

    if (findError) throw findError;

    if (existingRepo) {
      // Restart job if it's failed, or sync if it's ready
      if (existingRepo.status === "failed" || existingRepo.status === "ready") {
         await supabase.from("repositories").update({ status: "queued" }).eq("id", existingRepo.id);
         startIndexingJob(existingRepo.id, url, githubToken);
         existingRepo.status = "queued";
      }
      return res.status(200).json(existingRepo);
    }

    // Insert new repository
    const { data: newRepo, error: insertError } = await supabase
      .from("repositories")
      .insert({
        github_url: url,
        owner,
        name,
        status: "queued"
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Start background job
    startIndexingJob(newRepo.id, url, githubToken);

    res.status(201).json(newRepo);
  } catch (err) {
    next(err);
  }
});

// GET /api/repos/:id — Get repository status and metadata
repoRoutes.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: repo, error } = await supabase
      .from("repositories")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!repo) throw createAppError("Repository not found", 404);

    res.json(repo);
  } catch (err) {
    next(err);
  }
});

// POST /api/repos/:id/sync — Re-index / sync latest commits
repoRoutes.post("/:id/sync", async (req, res, next) => {
  try {
    const { id } = req.params;
    const githubToken = req.headers["x-github-token"] as string | undefined;

    const { data: repo, error } = await supabase
      .from("repositories")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!repo) throw createAppError("Repository not found", 404);

    // If it's already indexing or cloning, don't trigger another one
    if (repo.status === "indexing" || repo.status === "cloning" || repo.status === "queued") {
      return res.json({ message: "Sync already in progress", repo });
    }

    // Set to queued to start the UI polling
    await supabase.from("repositories").update({ status: "queued" }).eq("id", id);
    
    // Start background job
    startIndexingJob(repo.id, repo.github_url, githubToken);

    res.json({ message: "Sync started", repo: { ...repo, status: "queued" } });
  } catch (err) {
    next(err);
  }
});

// GET /api/repos/:id/commits — Paginated commit list
repoRoutes.get("/:id/commits", async (req, res, next) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page as string || "1", 10);
    const limit = parseInt(req.query.limit as string || "50", 10);
    
    const offset = (page - 1) * limit;

    // Fetch commits ordered by authored_at DESC
    const { data: commits, error, count } = await supabase
      .from("commits")
      .select("*", { count: "exact" })
      .eq("repo_id", id)
      .order("authored_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      data: commits,
      meta: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/repos/:id/commits/evolution — Lightweight macro-view for timeline visualization
repoRoutes.get("/:id/commits/evolution", async (req, res, next) => {
  try {
    const { id } = req.params;
    const limit = 1000; // Hard cap for performance

    const { data: commits, error } = await supabase
      .from("commits")
      .select("sha, message, author_name, authored_at")
      .eq("repo_id", id)
      .order("authored_at", { ascending: true }) // Ascending for horizontal left-to-right timeline
      .limit(limit);

    if (error) throw error;

    res.json(commits);
  } catch (err) {
    next(err);
  }
});

// POST /api/repos/:id/save — Save a repository to the dashboard
repoRoutes.post("/:id/save", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const { error } = await supabase
      .from("saved_repositories")
      .insert({ user_id: userId, repo_id: id });

    if (error && error.code !== "23505") { // Ignore duplicates
      throw error;
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/repos/:id/save — Unsave a repository
repoRoutes.delete("/:id/save", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const { error } = await supabase
      .from("saved_repositories")
      .delete()
      .match({ user_id: userId, repo_id: id });

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
