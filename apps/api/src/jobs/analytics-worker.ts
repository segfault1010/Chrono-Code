import { supabase } from "../lib/db";
import { computeAnalytics, AnalyticsType } from "../services/analytics-pipeline";

let isRunning = false;
let workerInterval: NodeJS.Timeout | null = null;

const WORKER_INTERVAL_MS = 5000; // Poll every 5 seconds

export function startAnalyticsWorker() {
  if (workerInterval) return;
  
  console.log("[analytics-worker] Starting analytics background worker...");
  
  workerInterval = setInterval(async () => {
    if (isRunning) return;
    isRunning = true;
    
    try {
      // Find one queued job
      const { data: job, error: fetchErr } = await supabase
        .from("repository_analytics")
        .select("repo_id, analytics_type, last_commit_sha")
        .eq("status", "queued")
        .limit(1)
        .maybeSingle();
        
      if (fetchErr) {
        console.error("[analytics-worker] Error fetching job:", fetchErr);
        return;
      }
      
      if (job) {
        console.log(`[analytics-worker] Worker picked up job: ${job.analytics_type} for repo ${job.repo_id}`);
        // Mark as computing
        const { error: updateErr } = await supabase
          .from("repository_analytics")
          .update({ status: "computing" })
          .eq("repo_id", job.repo_id)
          .eq("analytics_type", job.analytics_type)
          .eq("status", "queued"); // Ensure no race condition
          
        if (updateErr) {
          console.error(`[analytics-worker] Failed to transition job to computing:`, updateErr);
        } else {
           console.log(`[analytics-worker] Status updated to 'computing' for ${job.analytics_type}`);
           await computeAnalytics(job.repo_id, job.analytics_type as AnalyticsType, job.last_commit_sha);
        }
      }
    } catch (err) {
      console.error("[analytics-worker] Unexpected error in worker loop:", err);
    } finally {
      isRunning = false;
    }
  }, WORKER_INTERVAL_MS);
}
