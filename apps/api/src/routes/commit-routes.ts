// ============================================================================
// Commit Routes
// GET /api/commits/:sha/explain — Get or generate AI explanation for a commit
// ============================================================================

import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { supabase } from "../lib/db";
import rateLimit from "express-rate-limit";
import { streamCommitExplanation } from "../services/explanation-service";
import { createAppError } from "../middleware/error-handler";

export const commitRoutes = Router();

// Stricter rate limit for AI explanation generation (20 requests per hour per IP)
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: "AI explanation rate limit exceeded. Please try again in an hour." },
  standardHeaders: true,
  legacyHeaders: false,
});

import { requireAuth } from "../middleware/auth-middleware";

// GET /api/commits/:sha/explain?repoId=xxx — Generate or fetch AI explanation
commitRoutes.get("/:sha/explain", requireAuth, aiLimiter, async (req: Request<{ sha: string }>, res: Response, next: NextFunction) => {
  try {
    const { sha } = req.params;
    const repoId = req.query.repoId as string;
    
    if (!repoId || !sha) {
       throw createAppError("Missing repoId (query) or sha (param)", 400);
    }

    // The streamCommitExplanation function now directly writes to and ends the `res` object
    await streamCommitExplanation(repoId, sha, res);
  } catch (err) {
    next(err);
  }
});
