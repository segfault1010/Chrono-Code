import { model } from "../lib/gemini";
import type { RepositoryJourney, JourneyInsights } from "@chronocode/shared-types";
import type { Response } from "express";

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

import { supabase } from "../lib/db";

export async function getOrGenerateJourneyInsights(repoId: string, journey: RepositoryJourney, forceRefresh: boolean = false): Promise<JourneyInsights> {
  const tStart = performance.now();
  console.log(`[Journey] Request received (Insight Generation Start)`);
  const milestones = journey?.milestones || [];
  const latestCommit = milestones.length > 0 ? milestones[0]!.sha : "empty";

  const tCacheLookup = performance.now();
  if (!forceRefresh) {
    const { data: existing, error: fetchErr } = await supabase
      .from("repository_insights")
      .select("*")
      .eq("repository_id", repoId)
      .maybeSingle();

    console.log(`[Journey] Cache lookup: ${Math.round(performance.now() - tCacheLookup)}ms`);
    console.log(`[Journey] Cache ${existing ? "HIT" : "MISS"}`);

    if (fetchErr) {
      console.error(`[insights-service] Error fetching cache:`, fetchErr);
    }

    if (existing) {
      if (existing.status === 'completed') {
        return {
          status: 'completed',
          analyzed_commit_sha: existing.analyzed_commit_sha,
          updated_at: existing.updated_at,
          ai_summary: existing.ai_summary,
          health_indicators: existing.health_indicators
        };
      }
      if (existing.status === 'generating') {
        return { status: 'generating', analyzed_commit_sha: existing.analyzed_commit_sha };
      }
    }
  }

  // Insert or mark as generating
  const { error: upsertErr } = await supabase.from("repository_insights").upsert({
    repository_id: repoId,
    status: 'generating',
    analyzed_commit_sha: latestCommit,
    updated_at: new Date().toISOString()
  }, { onConflict: 'repository_id' });
  
  // Run in background (do not await)
  generateInsightsInBackground(repoId, journey, latestCommit).catch(err => {
    supabase.from("repository_insights").update({ status: 'error' }).eq("repository_id", repoId).then();
  });

  return { status: 'generating', analyzed_commit_sha: latestCommit };
}

async function generateInsightsInBackground(repoId: string, journey: RepositoryJourney, latestCommit: string) {
  const tBgStart = performance.now();
  let aiDuration = 0;
  try {
    const promptData = {
      repository_stats: journey?.stats || {},
      phases: (journey?.phases || []).map(p => p.name),
      top_milestones: (journey?.milestones || [])
        .sort((a, b) => b.impact_score - a.impact_score)
        .slice(0, 10)
        .map(m => ({
          date: m.authored_at,
          category: m.category,
          msg: m.message.split('\n')[0],
          insertions: m.insertions,
          deletions: m.deletions,
          files_changed: m.files_changed,
        })),
    };

    const prompt = `Here is the aggregated data for the repository journey:\n\n${JSON.stringify(promptData, null, 2)}\n\nGenerate the JSON insights.`;

    const tAi = performance.now();
    console.log(`[Journey] Number of AI requests executed: 1`);
    const result = await model.generateContent({
      contents: [
        { role: "user", parts: [{ text: SYSTEM_PROMPT + "\n\n" + prompt }] }
      ]
    });
    aiDuration = performance.now() - tAi;
    console.log(`[Journey] AI insight generation: ${Math.round(aiDuration)}ms`);

    const text = result.response.text();
    const cleanJson = text.replace(/^```json\n?/, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(cleanJson);

    const tSave = performance.now();
    await supabase.from("repository_insights").update({
      ai_summary: parsed.ai_summary,
      health_indicators: parsed.health_indicators,
      status: 'completed',
      analyzed_commit_sha: latestCommit,
      updated_at: new Date().toISOString()
    }).eq("repository_id", repoId);
    console.log(`[Journey] Cache save: ${Math.round(performance.now() - tSave)}ms`);
    console.log(`[Journey] TOTAL: ${Math.round(performance.now() - tBgStart)}ms`);
  } catch (error) {
    await supabase.from("repository_insights").update({ status: 'error' }).eq("repository_id", repoId);
  }
}
