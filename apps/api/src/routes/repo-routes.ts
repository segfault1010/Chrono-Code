// ============================================================================
// Repository Routes
// POST /api/repos       — Start indexing a new repository
// GET  /api/repos/:id   — Get repository status and metadata
// ============================================================================

import { Router } from "express";

export const repoRoutes = Router();

// POST /api/repos — Start indexing a new repository
repoRoutes.post("/", (_req, res) => {
  // TODO: Phase 4 — Implement repository import pipeline
  res.status(501).json({ error: "Not implemented yet" });
});

// GET /api/repos/:id — Get repository status and metadata
repoRoutes.get("/:id", (_req, res) => {
  // TODO: Phase 4 — Implement repository status endpoint
  res.status(501).json({ error: "Not implemented yet" });
});

// GET /api/repos/:id/commits — Paginated commit list
repoRoutes.get("/:id/commits", (_req, res) => {
  // TODO: Phase 6 — Implement paginated commit list
  res.status(501).json({ error: "Not implemented yet" });
});
