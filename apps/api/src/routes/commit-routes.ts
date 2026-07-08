// ============================================================================
// Commit Routes
// GET /api/commits/:sha/explain — Get or generate AI explanation for a commit
// ============================================================================

import { Router } from "express";
import { supabase } from "../lib/db";
import { explainCommit } from "../services/explanation-service";
import { createAppError } from "../middleware/error-handler";

export const commitRoutes = Router();

// GET /api/commits/:sha/explain?repoId=xxx — Generate or fetch AI explanation
commitRoutes.get("/:sha/explain", async (req, res, next) => {
  try {
    const { sha } = req.params;
    const repoId = req.query.repoId as string;
    
    if (!repoId || !sha) {
       throw createAppError("Missing repoId (query) or sha (param)", 400);
    }

    const explanation = await explainCommit(repoId, sha);
    res.json(explanation);
  } catch (err) {
    next(err);
  }
});
