// ============================================================================
// Repository Routes
// POST /api/repos       — Start indexing a new repository
// GET  /api/repos/:id   — Get repository status and metadata
// ============================================================================

import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { supabase } from "../lib/db";
import { validateGithubUrl } from "../services/clone-service";
import { startSyncJob } from "../jobs/sync-job";
import { getOrGenerateJourneyInsights } from "../services/insights-service";
import { getOrGenerateComparisonInsights } from "../services/compare-service";
import { fetchGithubCommitCount } from "../services/github-service";
import { getCommitCount } from "../services/clone-service";
import { rateLimit } from "express-rate-limit";
import { semanticSearch } from "../services/search-service";
import { createAppError } from "../middleware/error-handler";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth-middleware";
import { getFunctionHistory } from "../services/function-service";
import { getCachedAnalytics } from "../services/analytics-pipeline";
import * as path from "path";

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
        return res.json([{ ...exactMatch, similarity: 1 }]);
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

    const { owner, name, normalizedUrl } = await validateGithubUrl(url);

    // Idempotency: Check if repository already exists
    const { data: existingRepo, error: findError } = await supabase
      .from("repositories")
      .select("*")
      .eq("github_url", normalizedUrl)
      .maybeSingle();

    if (findError) throw findError;

    if (existingRepo) {
      // Restart job if it's failed, or sync if it's ready
      if (existingRepo.status === "failed" || existingRepo.status === "ready") {
        await supabase.from("repositories").update({ status: "queued" }).eq("id", existingRepo.id);
        existingRepo.status = "queued";
      }
      return res.status(200).json(existingRepo);
    }

    // Insert new repository
    const { data: newRepo, error: insertError } = await supabase
      .from("repositories")
      .insert({
        github_url: normalizedUrl,
        owner,
        name,
        status: "queued"
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Enqueued for background worker
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

    // Self-heal: if repo is ready but indexed_commits is 0, reconcile against actual count
    if (repo.status === "ready" && repo.indexed_commits === 0 && (repo.total_commits || 0) > 0) {
      const { count: actualCount } = await supabase
        .from("commits")
        .select("id", { count: "exact", head: true })
        .eq("repo_id", id);

      if (actualCount && actualCount > 0) {
        const progress = repo.total_commits > 0
          ? Math.min(Math.round((actualCount / repo.total_commits) * 100 * 10) / 10, 100)
          : 100;

        await supabase
          .from("repositories")
          .update({ indexed_commits: actualCount, indexing_progress: progress })
          .eq("id", id);

        repo.indexed_commits = actualCount;
        repo.indexing_progress = progress;
      }
    }

    res.json(repo);
  } catch (err) {
    next(err);
  }
});

// GET /api/repos/:id/health — Get detailed pipeline and repository health
repoRoutes.get("/:id/health", async (req, res, next) => {
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

    const CLONE_BASE_PATH = "/tmp/chronocode";
    const repoPath = path.resolve(CLONE_BASE_PATH, repo.owner, repo.name);

    // Get metrics
    const [
      githubCommitCount,
      journeyRes,
      contributorsRes,
      evolutionRes
    ] = await Promise.all([
      fetchGithubCommitCount(repo.github_url, githubToken).catch(() => 0),
      getCachedAnalytics(id, "journey").catch(() => ({ status: "error" })),
      getCachedAnalytics(id, "contributors").catch(() => ({ status: "error" })),
      getCachedAnalytics(id, "evolution").catch(() => ({ status: "error" }))
    ]);

    let localGitCommitCount = 0;
    let localHeadSha = "";
    try {
      const { execSync } = require("child_process");
      localGitCommitCount = await getCommitCount(repoPath);
      localHeadSha = execSync(`git rev-parse HEAD`, { cwd: repoPath }).toString().trim();
    } catch (e) {
      // Ignored, repo might not be cloned
    }

    const { count: dbCommitCount } = await supabase
      .from("commits")
      .select("id", { count: "exact", head: true })
      .eq("repo_id", id);

    const { data: distinctShas } = await supabase
      .from("commits")
      .select("sha")
      .eq("repo_id", id);

    const distinctShaCount = new Set(distinctShas?.map(c => c.sha)).size;

    const { data: latestCommit } = await supabase
      .from("commits")
      .select("sha")
      .eq("repo_id", id)
      .order("authored_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: pipelineRun } = await supabase
      .from("repository_pipeline_runs")
      .select("*")
      .eq("repo_id", id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const isVerificationFailed = repo.verification_status === "failed";
    const isVerificationWarning = repo.verification_status === "warning";
    const analyticsStatuses = [journeyRes.status, contributorsRes.status, evolutionRes.status];
    const isAnalyticsFailed = analyticsStatuses.some(s => s === "failed" || s === "error");
    const isAnalyticsPending = analyticsStatuses.some(s => s === "pending" || s === "queued" || s === "computing");

    let overall_health = "Healthy";
    if (repo.status === "failed" || isVerificationFailed) {
      overall_health = "Broken";
    } else if (isVerificationWarning || isAnalyticsFailed) {
      overall_health = "Warning";
    } else if (repo.status !== "ready" || isAnalyticsPending) {
      overall_health = "Warning"; // Still processing / Degraded
    }

    res.json({
      overallHealth: overall_health,
      repositoryStatus: repo.status,
      verificationStatus: repo.verification_status,
      verificationReason: repo.verification_reason,
      metrics: {
        githubCommitCount,
        localGitCommitCount,
        databaseCommitCount: dbCommitCount || 0,
        distinctShaCount,
        localHeadSha,
        databaseHeadSha: latestCommit?.sha || null,
        repoLastIndexedSha: repo.last_indexed_sha
      },
      analyticsStatus: {
        journey: journeyRes.status,
        contributors: contributorsRes.status,
        evolution: evolutionRes.status
      },
      latestPipelineRun: pipelineRun || null
    });
  } catch (err) {
    next(err);
  }
});


// POST /api/repos/:id/sync — Sync latest commits (lightweight, independent from historical indexing)
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

    // If it's actively cloning or in initial indexing, don't trigger sync
    if (repo.status === "cloning" || repo.status === "queued" || repo.status === "indexing") {
      return res.json({ message: "Initial indexing in progress, sync will be available shortly", repo });
    }

    // Use the lightweight sync job — works during 'indexing_history' and 'ready'
    startSyncJob(repo.id, repo.github_url, githubToken);

    res.json({ message: "Sync started", repo });
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

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    res.json({
      data: commits,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasMore: page < totalPages
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

    const { data, status, generated_at, analytics_version, error_message } = await getCachedAnalytics(id, "evolution");

    res.json({
      data: Array.isArray(data) ? data : [],
      meta: { status, generated_at, analytics_version, error_message }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/repos/:id/functions/history — Get function-level history
repoRoutes.get("/:id/functions/history", async (req, res, next) => {
  try {
    const { id } = req.params;
    const filePath = req.query.filePath as string;
    const functionName = req.query.functionName as string;

    if (!filePath || !functionName) {
      throw createAppError("Missing required query parameters: 'filePath' and 'functionName'", 400);
    }

    const { data: repo, error } = await supabase
      .from("repositories")
      .select("owner, name")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!repo) throw createAppError("Repository not found", 404);

    const CLONE_BASE_PATH = "/tmp/chronocode";
    const repoPath = path.resolve(CLONE_BASE_PATH, repo.owner, repo.name);

    const history = await getFunctionHistory(repoPath, filePath, functionName);

    res.json({
      functionName,
      filePath,
      history
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/repos/:id/journey — Aggregated repository journey (milestones & activity)
repoRoutes.get("/:id/journey", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data, status, generated_at, analytics_version, error_message } = await getCachedAnalytics(id, "journey");

    // Original returned just the journey object. We'll add meta inside it.
    res.json({
      ...data,
      _meta: { status, generated_at, analytics_version, error_message }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/repos/:id/journey/insights — AI Summary and Health
const insightsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 1000,
  message: { error: "AI insight rate limit exceeded." },
});

repoRoutes.get("/:id/journey/insights", insightsLimiter, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const forceRefresh = req.query.refresh === 'true';

    // Insights service needs a valid journey object. We'll fetch the cached journey data.
    const { data: journeyData } = await getCachedAnalytics(id, "journey");

    // The insight service expects `journey` with .milestones, .stats, etc.
    // If it's empty, we pass an empty object and it might generate a poor insight, 
    // but typically insights are requested after journey is ready.
    const insights = await getOrGenerateJourneyInsights(id, journeyData as any, forceRefresh);
    res.json(insights);
  } catch (err) {
    next(err);
  }
});

// GET /api/repos/compare/:id1/:id2/insights — AI Summary comparing two repos
repoRoutes.get("/compare/:id1/:id2/insights", insightsLimiter, async (req: Request<{ id1: string; id2: string }>, res: Response, next: NextFunction) => {
  try {
    const { id1, id2 } = req.params;
    const forceRefresh = req.query.refresh === 'true';

    // Fetch cached journeys for both to pass to the AI if needed
    const { data: journey1 } = await getCachedAnalytics(id1, "journey");
    const { data: journey2 } = await getCachedAnalytics(id2, "journey");

    const insights = await getOrGenerateComparisonInsights(id1, id2, journey1 as any, journey2 as any, forceRefresh);
    res.json(insights);
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
