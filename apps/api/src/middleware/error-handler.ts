// ============================================================================
// Global Error Handler Middleware
// Catches all unhandled errors and returns structured JSON responses.
// Must be registered LAST in the middleware chain.
// ============================================================================

import type { Request, Response, NextFunction } from "express";
import type { ApiErrorResponse } from "@chronocode/shared-types";

export interface AppError extends Error {
  statusCode?: number;
  details?: string;
}

export const errorHandler = (
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal server error";

  if (statusCode === 500) {
    console.error("[chronocode-api] Unhandled error:", err);
  }

  const body: ApiErrorResponse = {
    error: message,
    ...(err.details ? { details: err.details } : {}),
  };

  res.status(statusCode).json(body);
};

/**
 * Helper to create typed errors with HTTP status codes.
 */
export const createAppError = (
  message: string,
  statusCode: number,
  details?: string
): AppError => {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.details = details;
  return error;
};
