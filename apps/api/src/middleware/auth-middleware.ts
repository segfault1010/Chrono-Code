import type { Request, Response, NextFunction } from "express";
import { supabase } from "../lib/db";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
  };
  githubToken?: string;
}

export const requireAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
    };
    
    // Also extract GitHub provider token if sent by the frontend
    const githubToken = req.headers["x-github-token"] as string;
    if (githubToken) {
      req.githubToken = githubToken;
    }

    next();
  } catch (err) {
    next(err);
  }
};
