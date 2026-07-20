// ============================================================================
// GitHub Metadata Route
// GET /api/repos/:id/github-meta — Fetch instant GitHub metadata for a repo
// Returns: description, stars, forks, language, avatar, topics, etc.
// ============================================================================

import { Router } from "express";
import { supabase } from "../lib/db";
import { createAppError } from "../middleware/error-handler";

export const githubMetaRoutes = Router();

interface GitHubMeta {
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  avatar_url: string;
  topics: string[];
  size: number;
  visibility: string;
  created_at: string;
  pushed_at: string | null;
  license: string | null;
  default_branch: string;
  open_issues_count: number;
  watchers_count: number;
  fetched_at: string;
}

// GET /api/repos/:id/github-meta
githubMetaRoutes.get("/:id/github-meta", async (req, res, next) => {
  try {
    const { id } = req.params;
    const githubToken = req.headers["x-github-token"] as string | undefined;

    // 1. Get owner/name from DB (instant)
    const { data: repo, error } = await supabase
      .from("repositories")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!repo) throw createAppError("Repository not found", 404);

    // 2. Check if we have cached metadata (< 1 hour old)
    if (repo.github_meta) {
      const cached = repo.github_meta as any as GitHubMeta;
      if (cached.fetched_at) {
        const age = Date.now() - new Date(cached.fetched_at).getTime();
        if (age < 60 * 60 * 1000) {
          return res.json(cached);
        }
      }
    }

    // 3. Fetch from GitHub API
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Chrono-Code",
    };

    if (githubToken) {
      headers["Authorization"] = `Bearer ${githubToken}`;
    } else if (process.env.GITHUB_TOKEN) {
      headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const ghResponse = await fetch(
      `https://api.github.com/repos/${repo.owner}/${repo.name}`,
      { headers }
    );

    if (!ghResponse.ok) {
      console.warn(`[github-meta] GitHub API returned ${ghResponse.status} for ${repo.owner}/${repo.name}`);
      
      // Fallback to expired cache if available
      if (repo.github_meta) {
        console.log(`[github-meta] Falling back to expired cached metadata for ${repo.owner}/${repo.name}`);
        return res.json(repo.github_meta);
      }

      // Final fallback: Scrape the public HTML page to get stars and forks
      try {
        console.log(`[github-meta] Scraping HTML as final fallback for ${repo.owner}/${repo.name}`);
        const htmlRes = await fetch(`https://github.com/${repo.owner}/${repo.name}`);
        if (htmlRes.ok) {
          const html = await htmlRes.text();
          const starsMatch = html.match(/id="repo-stars-counter-star"[^>]*title="([^"]+)"/);
          const forksMatch = html.match(/id="repo-network-counter"[^>]*title="([^"]+)"/);
          
          const scrapedMeta = {
            description: null,
            stars: starsMatch ? parseInt(starsMatch[1].replace(/,/g, '')) || 0 : 0,
            forks: forksMatch ? parseInt(forksMatch[1].replace(/,/g, '')) || 0 : 0,
            language: null,
            avatar_url: `https://github.com/${repo.owner}.png`,
            topics: [],
            size: 0,
            visibility: "public",
            created_at: "",
            pushed_at: null,
            license: null,
            default_branch: "main",
            open_issues_count: 0,
            watchers_count: 0,
            fetched_at: new Date().toISOString(),
          };
          
          // Cache the scraped meta so we don't spam GitHub HTML either
          await supabase.from("repositories").update({ github_meta: scrapedMeta }).eq("id", id);
          
          return res.json(scrapedMeta);
        }
      } catch (e) {
        console.error("[github-meta] HTML scraping fallback failed", e);
      }

      // Return partial metadata if completely unavailable
      return res.json({
        description: null,
        stars: 0,
        forks: 0,
        language: null,
        avatar_url: `https://github.com/${repo.owner}.png`,
        topics: [],
        size: 0,
        visibility: "public",
        created_at: "",
        pushed_at: null,
        license: null,
        default_branch: "main",
        open_issues_count: 0,
        watchers_count: 0,
        fetched_at: new Date().toISOString(),
      });
    }

    const ghData = await ghResponse.json();

    const meta: GitHubMeta = {
      description: ghData.description,
      stars: ghData.stargazers_count || 0,
      forks: ghData.forks_count || 0,
      language: ghData.language,
      avatar_url: ghData.owner?.avatar_url || `https://github.com/${repo.owner}.png`,
      topics: ghData.topics || [],
      size: ghData.size || 0,
      visibility: ghData.visibility || "public",
      created_at: ghData.created_at || "",
      pushed_at: ghData.pushed_at,
      license: ghData.license?.spdx_id || null,
      default_branch: ghData.default_branch || "main",
      open_issues_count: ghData.open_issues_count || 0,
      watchers_count: ghData.watchers_count || 0,
      fetched_at: new Date().toISOString(),
    };

    // 4. Cache in DB (non-blocking)
    supabase
      .from("repositories")
      .update({ github_meta: meta as any })
      .eq("id", id)
      .then(({ error: updateErr }) => {
        if (updateErr) {
          // github_meta column may not exist yet — that's fine, just log
          console.warn(`[github-meta] Cache write failed (column may not exist):`, updateErr.message);
        }
      });

    res.json(meta);
  } catch (err) {
    next(err);
  }
});
