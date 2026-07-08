// ============================================================================
// Commit Routes
// GET /api/commits/:sha/explain — Get or generate AI explanation for a commit
// ============================================================================

import { Router } from "express";

export const commitRoutes = Router();

// GET /api/commits/:sha/explain — Get or generate AI explanation
commitRoutes.get("/:sha/explain", (_req, res) => {
  // TODO: Phase 5 — Implement AI explanation generation with caching
  res.status(501).json({ error: "Not implemented yet" });
});
