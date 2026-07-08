// ============================================================================
// Request Logger Middleware
// Logs method, path, status code, and response time for every request.
// ============================================================================

import type { Request, Response, NextFunction } from "express";

export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const method = req.method;
    const path = req.originalUrl;

    console.log(
      `[chronocode-api] ${method} ${path} → ${status} (${duration}ms)`
    );
  });

  next();
};
