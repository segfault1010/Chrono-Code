import { supabase } from "../lib/db";
import { model } from "../lib/gemini";
import type { RepositoryJourney } from "@chronocode/shared-types";
import type { Response } from "express";

const SYSTEM_PROMPT = `You are a senior software architect analyzing the evolutionary journey of a codebase.
Your goal is to summarize the project's history, identify key turning points, and evaluate its current state based on the provided milestones, phases, and activity data.

CRITICAL REQUIREMENT:
You MUST structure your response into exactly these six chapters, using these exact markdown headers:
# Origins
# Growth & Evolution
# Major Architectural Changes
# Key Milestones
# Current State
# Recommendations

Do not use JSON formatting. Write directly in markdown. Be concise, insightful, and professional.`;

export async function streamJourneyInsights(repoId: string, journey: RepositoryJourney, res: Response, forceRefresh = false): Promise<void> {
  const tStart = performance.now();
  console.log(`[Journey Stream] Request received for repo: ${repoId}`);
  
  const milestones = journey?.milestones || [];
  const latestCommit = milestones.length > 0 ? milestones[0]!.sha : "empty";

  // 1. Check Cache
  if (!forceRefresh) {
    const { data: existing, error: fetchErr } = await supabase
      .from("repository_insights")
      .select("ai_summary, status, updated_at")
      .eq("repository_id", repoId)
      .maybeSingle();

    if (fetchErr) {
      console.error(`[Journey Stream] Error fetching cache:`, fetchErr);
    }

    if (existing) {
      if (existing.status === 'completed' && existing.ai_summary) {
        console.log(`[Journey Stream] Cache hit. Streaming cached story immediately.`);
        // Stream cached content immediately
        res.write(`data: ${JSON.stringify({ text: existing.ai_summary })}\n\n`);
        res.write(`data: ${JSON.stringify({ done: true, source: 'cache', totalDurationMs: Math.round(performance.now() - tStart) })}\n\n`);
        res.end();
        return;
      } else if (existing.status === 'generating') {
        console.log(`[Journey Stream] Already generating in another process. Rejecting stream.`);
        res.write(`data: ${JSON.stringify({ error: "Story is already generating. Fallback to polling." })}\n\n`);
        res.end();
        return;
      }
    }
  }

  // 1.5 Track client disconnects
  let isConnectionClosed = false;
  res.on("close", () => {
    isConnectionClosed = true;
    console.log(`[Journey Stream] Client disconnected.`);
  });

  // 2. Prepare Prompt
  const promptData = {
    repository_stats: journey?.stats || {},
    phases: (journey?.phases || []).map(p => p.name),
    top_milestones: (journey?.milestones || [])
      .sort((a, b) => b.impact_score - a.impact_score)
      .slice(0, 15)
      .map(m => ({
        date: m.authored_at,
        category: m.category,
        msg: m.message.split('\n')[0],
      })),
  };

  const prompt = `Here is the aggregated data for the repository journey:\n\n${JSON.stringify(promptData, null, 2)}\n\nGenerate the repository story.`;

  // Update DB status
  await supabase.from("repository_insights").upsert({
    repository_id: repoId,
    status: 'generating',
    analyzed_commit_sha: latestCommit,
    updated_at: new Date().toISOString()
  }, { onConflict: 'repository_id' });

  // 3. Generate Stream
  console.log(`[Journey Stream] Requesting AI stream...`);
  const tAiStart = performance.now();
  let firstTokenTime = -1;
  let fullText = "";

  try {
    const resultStream = await model.generateContentStream({
      contents: [{ role: "user", parts: [{ text: SYSTEM_PROMPT + "\n\n" + prompt }] }]
    });

    for await (const chunk of resultStream.stream) {
      if (firstTokenTime === -1) {
        firstTokenTime = performance.now();
        console.log(`[Journey Stream] [TIMING] Time to first token: ${Math.round(firstTokenTime - tAiStart)}ms`);
      }
      
      const chunkText = chunk.text();
      fullText += chunkText;
      
      // Send chunk to client only if connected
      if (!isConnectionClosed) {
        res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
      }
    }

    const aiDuration = Math.round(performance.now() - tAiStart);
    console.log(`[Journey Stream] [TIMING] AI story stream completed in ${aiDuration}ms`);

    // 4. Save to DB asynchronously
    (async () => {
      try {
        await supabase.from("repository_insights").update({
          ai_summary: fullText,
          status: 'completed',
          analyzed_commit_sha: latestCommit,
          updated_at: new Date().toISOString()
        }).eq("repository_id", repoId);
        console.log(`[Journey Stream] DB updated to completed.`);
      } catch (err) {
        console.error(`[Journey Stream] Failed to save to DB:`, err);
      }
    })();

    const totalDuration = Math.round(performance.now() - tStart);
    res.write(`data: ${JSON.stringify({ done: true, source: 'ai', totalDurationMs: totalDuration, ttfbMs: Math.round(firstTokenTime - tAiStart) })}\n\n`);
    res.end();

  } catch (error) {
    console.error(`[Journey Stream] AI generation failed:`, error);
    await supabase.from("repository_insights").update({ status: 'error' }).eq("repository_id", repoId);
    res.write(`data: ${JSON.stringify({ error: "Failed to generate AI story" })}\n\n`);
    res.end();
  }
}
