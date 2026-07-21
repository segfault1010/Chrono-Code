import { supabase } from "../lib/db";
import { computeAnalytics, AnalyticsType } from "../services/analytics-pipeline";
import { executeWithTimeout } from "../lib/async-timeout";

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
           
           const result = await executeWithTimeout(
             { timeoutMs: 5 * 60 * 1000, retries: 2, taskName: `Analytics-${job.analytics_type}`, repoId: job.repo_id },
             async () => {
               // 1. Stale write prevention check
               const { data: repo } = await supabase
                 .from("repositories")
                 .select("last_indexed_sha")
                 .eq("id", job.repo_id)
                 .single();
                 
               if (!repo || repo.last_indexed_sha !== job.last_commit_sha) {
                 throw new Error("StaleWritePrevention: Repository has been re-indexed since this job was queued. Discarding job.");
               }
               
               // 2. Compute
               await computeAnalytics(job.repo_id, job.analytics_type as AnalyticsType, job.last_commit_sha);
             }
           );
           
           if (result.status !== "success") {
             // computeAnalytics already sets it to 'failed' on error internally, but let's be absolutely sure here for timeouts
             await supabase
               .from("repository_analytics")
               .update({ status: "failed", error_message: result.error?.message || "Task failed or timed out" })
               .eq("repo_id", job.repo_id)
               .eq("analytics_type", job.analytics_type);
           } else {
             // If this was journey analytics, queue Repository Story (Insights)
             if (job.analytics_type === "journey") {
               console.log(`[analytics-worker] Journey complete for ${job.repo_id}. Queuing Repository Story.`);
               await supabase
                 .from("repository_insights")
                 .upsert({
                   repo_id: job.repo_id,
                   status: "queued"
                 }, { onConflict: "repo_id" });
             }
           }
        }
      }
    } catch (err) {
      console.error("[analytics-worker] Unexpected error in worker loop:", err);
    } finally {
      isRunning = false;
    }
  }, WORKER_INTERVAL_MS);
}
