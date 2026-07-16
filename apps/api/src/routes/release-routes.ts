import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { streamReleaseNotes } from "../services/release-service";
import { requireAuth } from "../middleware/auth-middleware";
import { createAppError } from "../middleware/error-handler";
import rateLimit from "express-rate-limit";

export const releaseRoutes = Router();

const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20, // 20 requests per hour
  message: { error: "AI rate limit exceeded. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

releaseRoutes.get("/:id/releases/generate", requireAuth, aiLimiter, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const range = req.query.range as string || "last_50";
    
    if (!id) {
       throw createAppError("Missing repo id", 400);
    }

    await streamReleaseNotes(id, range, res);
  } catch (err) {
    next(err);
  }
});
