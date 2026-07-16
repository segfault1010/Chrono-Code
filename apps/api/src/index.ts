// ============================================================================
// Chronocode API — Entry Point
// Express server with middleware stack and route mounting.
// ============================================================================

import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { errorHandler } from "./middleware/error-handler";
import { requestLogger } from "./middleware/request-logger";
import { repoRoutes } from "./routes/repo-routes";
import { commitRoutes } from "./routes/commit-routes";
import { userRoutes } from "./routes/user-routes";
import { analyticsRoutes } from "./routes/analytics-routes";
import { releaseRoutes } from "./routes/release-routes";
import { riskRoutes } from "./routes/risk-routes";
import { supabase } from "./lib/db";
import { resumeIndexingJob } from "./jobs/index-repo-job";

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// Validate essential environment variables before starting
if (!process.env.GEMINI_API_KEY) {
  console.error("[chronocode-api] FATAL: GEMINI_API_KEY is not set.");
  process.exit(1);
}
if (!process.env.NODE_ENV) {
  console.warn("[chronocode-api] WARNING: NODE_ENV is not set, defaulting to development.");
}

// ---------------------------------------------------------------------------
// Global Middleware
// ---------------------------------------------------------------------------

// Global rate limiting: 5000 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  message: { error: "Too many requests from this IP, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(globalLimiter);

const configuredOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',').map(url => url.replace(/\/$/, "")) 
  : ["http://localhost:3000", "https://chrono-code-web.vercel.app"];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    // Check exact match from configuration
    if (configuredOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Allow Vercel preview/branch deployments for the frontend project safely
    if (/^https:\/\/(chrono-code-web|chronocode-web)(-[a-z0-9A-Z-]+)?\.vercel\.app$/.test(origin)) {
      return callback(null, true);
    }
    
    // Reject other origins
    return callback(null, false);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-GitHub-Token"],
}));

app.use(express.json());
app.use(requestLogger);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get("/", (_req, res) => {
  let version = "0.1.0";
  try {
    version = require("../package.json").version;
  } catch (e) {
    // fallback
  }

  res.status(200).json({
    service: "Chrono-Code API",
    status: "ok",
    version,
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  });
});

app.get(["/health", "/api/health"], (_req, res) => {
  res.status(200).json({
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/repos", repoRoutes);
app.use("/api/repos/:id/analytics", analyticsRoutes);
app.use("/api/repos", releaseRoutes);
app.use("/api/repos", riskRoutes);
app.use("/api/commits", commitRoutes);
app.use("/api/user", userRoutes);

// ---------------------------------------------------------------------------
// Error Handling (must be last)
// ---------------------------------------------------------------------------

app.use(errorHandler);

// ---------------------------------------------------------------------------
// Start Server
// ---------------------------------------------------------------------------

// Reset or resume orphaned jobs on startup
async function resetOrphanedJobs() {
  // Phase 1 jobs (queued/cloning/indexing) have no usable data yet — mark as failed
  const { error: phase1Err } = await supabase
    .from("repositories")
    .update({ status: "failed", error_message: "Indexing aborted due to server restart." })
    .in("status", ["queued", "cloning", "indexing"]);
    
  if (phase1Err) throw phase1Err;

  // Phase 2 jobs (indexing_history) have partial data and can be resumed
  const { data: resumable, error: phase2Err } = await supabase
    .from("repositories")
    .select("id, github_url")
    .eq("status", "indexing_history");
    
  if (phase2Err) throw phase2Err;

  if (resumable && resumable.length > 0) {
    console.log(`[chronocode-api] Resuming ${resumable.length} interrupted indexing job(s)...`);
    for (const repo of resumable) {
      resumeIndexingJob(repo.id, repo.github_url);
    }
  }

  console.log("[chronocode-api] Orphaned job handling complete.");
}

import { startAnalyticsWorker } from "./jobs/analytics-worker";
import { startPipelineWorker } from "./jobs/pipeline-worker";

function bootstrap() {
  console.log("[chronocode-api] Bootstrapping...");

  const server = app.listen(PORT as number, "0.0.0.0", () => {
    console.log(`[chronocode-api] Server listening on PORT ${PORT}`);
    console.log("[chronocode-api] Health endpoint available");

    // Asynchronously execute background tasks without blocking
    Promise.resolve().then(async () => {
      try {
        console.log("[chronocode-api] Starting orphaned job recovery...");
        await resetOrphanedJobs();

        console.log("[chronocode-api] Starting analytics worker...");
        startAnalyticsWorker();

        console.log("[chronocode-api] Starting pipeline worker...");
        startPipelineWorker();

        console.log("[chronocode-api] Startup complete.");
      } catch (err) {
        console.error("[chronocode-api] Background initialization failed:", err);
      }
    });
  });

  server.on("error", (err) => {
    console.error(err);
    process.exit(1);
  });
}

if (require.main === module) {
  bootstrap();
}

export default app;
