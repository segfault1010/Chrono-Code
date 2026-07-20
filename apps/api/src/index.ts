// ============================================================================
// Chronocode API — Entry Point
// Express server with middleware stack and route mounting.
// ============================================================================
console.log("1. dotenv loaded");
import "dotenv/config";

console.log("2. express created");
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
import { githubMetaRoutes } from "./routes/github-meta-route";
import { supabase } from "./lib/db";
import { resumeIndexingJob } from "./jobs/index-repo-job";

let app: express.Express;
let PORT: number;

try {
  app = express();
  PORT = Number(process.env.PORT) || 3001;
} catch (e) {
  console.error("Exception during express creation:", e);
  process.exit(1);
}

console.log("3. env validated");
try {
  if (!process.env.GEMINI_API_KEY) {
    console.error("[chronocode-api] FATAL: GEMINI_API_KEY is not set.");
    process.exit(1);
  }
  if (!process.env.NODE_ENV) {
    console.warn("[chronocode-api] WARNING: NODE_ENV is not set, defaulting to development.");
  }
} catch (e) {
  console.error("Exception during env validation:", e);
  process.exit(1);
}

console.log("4. routes mounted");
try {
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
      if (configuredOrigins.includes(origin)) {
        return callback(null, true);
      }
      const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
      return callback(new Error(msg), false);
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-GitHub-Token"],
  }));

  app.use(express.json());
  app.use(requestLogger);

  app.get("/", (_req, res) => {
    let version = "0.1.0";
    try {
      version = require("../package.json").version;
    } catch (e) { }
    res.status(200).json({ service: "Chrono-Code API", status: "ok", version, environment: process.env.NODE_ENV || "development", timestamp: new Date().toISOString() });
  });

  app.get(["/health", "/api/health"], (_req, res) => {
    res.status(200).json({ status: "healthy", uptime: process.uptime(), timestamp: new Date().toISOString() });
  });

  app.use("/api/repos", repoRoutes);
  app.use("/api/repos", githubMetaRoutes);
  app.use("/api/commits", commitRoutes);
  app.use("/api/analytics", analyticsRoutes);
  app.use("/api/releases", releaseRoutes);
  app.use("/api/risk", riskRoutes);
  app.use("/api/user", userRoutes);
  app.use(errorHandler);
} catch (e) {
  console.error("Exception during route mounting:", e);
  process.exit(1);
}

async function resetOrphanedJobs() {
  console.log("[pipeline-worker] resetOrphanedJobs: Starting phase 1 (resetting queued/cloning/fetching_commits/indexing/verifying to failed)...");
  const { data: phase1Data, error: phase1Err, count: phase1Count } = await supabase.from("repositories").update({ status: "failed", error_message: "Indexing aborted due to server restart." }).in("status", ["queued", "cloning", "fetching_commits", "indexing", "verifying"]).select("id");
  
  console.log(`[pipeline-worker] resetOrphanedJobs: Phase 1 complete. Affected rows: ${phase1Data?.length || 0}. Error: ${phase1Err ? JSON.stringify(phase1Err) : 'none'}`);
  if (phase1Err) {
    console.error("[pipeline-worker] FATAL: resetOrphanedJobs Phase 1 failed:", phase1Err);
    throw phase1Err;
  }

  console.log("[pipeline-worker] resetOrphanedJobs: Starting phase 2 (fetching indexing_history)...");
  const { data: resumable, error: phase2Err } = await supabase.from("repositories").select("id, github_url").eq("status", "indexing_history");
  
  console.log(`[pipeline-worker] resetOrphanedJobs: Phase 2 complete. Found ${resumable?.length || 0} resumable jobs. Error: ${phase2Err ? JSON.stringify(phase2Err) : 'none'}`);
  if (phase2Err) {
    console.error("[pipeline-worker] FATAL: resetOrphanedJobs Phase 2 failed:", phase2Err);
    throw phase2Err;
  }

  if (resumable && resumable.length > 0) {
    for (const repo of resumable) {
      console.log(`[pipeline-worker] resetOrphanedJobs: Resuming indexing_history job for ${repo.id}`);
      resumeIndexingJob(repo.id, repo.github_url);
    }
  }
}

import { startAnalyticsWorker } from "./jobs/analytics-worker";
import { startPipelineWorker } from "./jobs/pipeline-worker";

console.log("5. about to listen");
function bootstrap() {
  console.log("Bootstrapping...");

  let server;
  try {
    server = app.listen(PORT as number, "0.0.0.0", () => {
      console.log("6. server listening");
      console.log(`[chronocode-api] Server listening on PORT ${PORT}`);
      console.log("[chronocode-api] Health endpoint available");

      Promise.resolve().then(async () => {
        try {
          console.log("7. resetOrphanedJobs");
          console.log("Starting orphaned job recovery...");
          await resetOrphanedJobs();

          console.log("8. analytics worker");
          console.log("Starting analytics worker...");
          startAnalyticsWorker();

          console.log("9. pipeline worker");
          console.log("Starting pipeline worker...");
          startPipelineWorker();

          console.log("Startup complete.");
        } catch (err) {
          console.error("Background initialization failed:", err);
        }
      });
    });
  } catch (err) {
    console.error("Exception during app.listen():", err);
    process.exit(1);
  }

  server.on("error", (err) => {
    console.error("Server on error event:", err);
    process.exit(1);
  });
}

if (require.main === module) {
  try {
    bootstrap();
  } catch (e) {
    console.error("Exception in bootstrap block:", e);
    process.exit(1);
  }
}

export default app;
