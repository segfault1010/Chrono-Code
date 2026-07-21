import { supabase } from "../lib/db";
import { executeWithTimeout } from "../lib/async-timeout";
import { model } from "../lib/gemini";

let isRunning = false;
let workerInterval: NodeJS.Timeout | null = null;

const WORKER_INTERVAL_MS = 10000; // Poll every 10 seconds

const SYSTEM_PROMPT = `You are a senior software architect analyzing the evolutionary journey of a codebase.
Your goal is to summarize the project's history, identify key turning points, and evaluate its current health based on the provided milestones, phases, and activity data.

Format your output EXACTLY as a JSON object matching this schema:
{
  "ai_summary": "A concise 2-3 paragraph story of how the project evolved. Do not use markdown headers.",
  "health_indicators": [
    {
      "label": "Architecture Stability",
      "value": "High/Medium/Low",
      "status": "good" | "warning" | "neutral"
    }
    // Provide exactly 3-5 distinct indicators
  ]
}

DO NOT output markdown formatting blocks like \`\`\`json. ONLY output the raw JSON object.`;

export function startInsightsWorker() {
  if (workerInterval) return;
  
  console.log("[insights-worker] Starting repository story background worker...");
  
  workerInterval = setInterval(async () => {
    if (isRunning) return;
    isRunning = true;
    
    try {
      // Find one queued job
      const { data: job, error: fetchErr } = await supabase
        .from("repository_insights")
        .select("repository_id")
        .eq("status", "queued")
        .limit(1)
        .maybeSingle();
        
      if (fetchErr) {
        console.error("[insights-worker] Error fetching job:", fetchErr);
        return;
      }
      
      if (job) {
        const repoId = job.repository_id;
        console.log(`[insights-worker] Worker picked up job for repo ${repoId}`);
        
        // Mark as generating
        await supabase
          .from("repository_insights")
          .update({ status: "generating", updated_at: new Date().toISOString() })
          .eq("repository_id", repoId)
          .eq("status", "queued");
          
        const result = await executeWithTimeout(
          { timeoutMs: 5 * 60 * 1000, retries: 2, taskName: "RepositoryStory", repoId },
          async () => {
             // 1. Fetch journey analytics
             const { data: journeyCached } = await supabase
               .from("repository_analytics")
               .select("data, last_commit_sha")
               .eq("repo_id", repoId)
               .eq("analytics_type", "journey")
               .single();
               
             if (!journeyCached || !journeyCached.data) {
               throw new Error("Missing journey analytics data to generate story");
             }
             const journey = journeyCached.data as any;
             const latestCommit = journeyCached.last_commit_sha;

             // 2. Stale write prevention check
             const { data: repo } = await supabase
               .from("repositories")
               .select("last_indexed_sha")
               .eq("id", repoId)
               .single();
               
             if (!repo || repo.last_indexed_sha !== latestCommit) {
               throw new Error("StaleWritePrevention: Repository has been re-indexed since this job was queued. Discarding story generation.");
             }

             // 3. Prepare AI Prompt
             const promptData = {
               repository_stats: journey?.stats || {},
               phases: (journey?.phases || []).map((p: any) => p.name),
               top_milestones: (journey?.milestones || [])
                 .sort((a: any, b: any) => b.impact_score - a.impact_score)
                 .slice(0, 10)
                 .map((m: any) => ({
                   date: m.authored_at,
                   category: m.category,
                   msg: m.message.split('\n')[0],
                   insertions: m.insertions,
                   deletions: m.deletions,
                   files_changed: m.files_changed,
                 })),
             };

             const prompt = `Here is the aggregated data for the repository journey:\n\n${JSON.stringify(promptData, null, 2)}\n\nGenerate the JSON insights.`;
             
             // 4. Generate Content
             const aiResult = await model.generateContent({
               contents: [
                 { role: "user", parts: [{ text: SYSTEM_PROMPT + "\n\n" + prompt }] }
               ]
             });
             
             const text = aiResult.response.text();
             const cleanJson = text.replace(/^```json\n?/, "").replace(/```$/, "").trim();
             const parsed = JSON.parse(cleanJson);
             
             // 5. Save Results
             await supabase.from("repository_insights").update({
               ai_summary: parsed.ai_summary,
               health_indicators: parsed.health_indicators,
               status: 'completed',
               analyzed_commit_sha: latestCommit,
               updated_at: new Date().toISOString()
             }).eq("repository_id", repoId);
             
             return parsed;
          }
        );
        
        if (result.status !== "success") {
          await supabase
            .from("repository_insights")
            .update({ status: "failed", updated_at: new Date().toISOString() })
            .eq("repository_id", repoId);
        } else {
          console.log(`[insights-worker] Successfully generated Repository Story for ${repoId}`);
        }
      }
    } catch (err) {
      console.error("[insights-worker] Unexpected error in worker loop:", err);
    } finally {
      isRunning = false;
    }
  }, WORKER_INTERVAL_MS);
}
