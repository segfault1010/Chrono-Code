import { model } from "../lib/gemini";
import type { RepositoryJourney, JourneyInsights } from "@chronocode/shared-types";
import { Response } from "express";

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
  console.log(`[insights-service] getOrGenerateJourneyInsights called for repoId: ${repoId}, forceRefresh: ${forceRefresh}`);
  const latestCommit = journey.milestones.length > 0 ? journey.milestones[0]!.sha : "empty";

  // Check cache
  if (!forceRefresh) {
    const { data: existing, error: fetchErr } = await supabase
      .from("repository_insights")
      .select("*")
      .eq("repository_id", repoId)
      .maybeSingle();

    if (fetchErr) {
      console.error(`[insights-service] Error fetching cache:`, fetchErr);
    }

    if (existing) {
      console.log(`[insights-service] Found cached insights with status: ${existing.status}`);
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
    } else {
      console.log(`[insights-service] No cached insights found for ${repoId}`);
    }
  }

  // Insert or mark as generating
  console.log(`[insights-service] Upserting 'generating' state for ${repoId}...`);
  const { error: upsertErr } = await supabase.from("repository_insights").upsert({
    repository_id: repoId,
    status: 'generating',
    analyzed_commit_sha: latestCommit,
    updated_at: new Date().toISOString()
  }, { onConflict: 'repository_id' });
  
  if (upsertErr) {
    console.error(`[insights-service] Upsert error:`, upsertErr);
  } else {
    console.log(`[insights-service] Upsert successful for ${repoId}`);
  }

  // Run in background (do not await)
  generateInsightsInBackground(repoId, journey, latestCommit).catch(err => {
    console.error("[chronocode-api] Background generation failed:", err);
    supabase.from("repository_insights").update({ status: 'error' }).eq("repository_id", repoId).then();
  });

  return { status: 'generating', analyzed_commit_sha: latestCommit };
}

async function generateInsightsInBackground(repoId: string, journey: RepositoryJourney, latestCommit: string) {
  try {
    const promptData = {
      repository_stats: journey.stats,
      phases: journey.phases.map(p => p.name),
      top_milestones: journey.milestones
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

    const result = await model.generateContent({
      contents: [
        { role: "user", parts: [{ text: SYSTEM_PROMPT + "\n\n" + prompt }] }
      ]
    });

    const text = result.response.text();
    const cleanJson = text.replace(/^```json\n?/, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(cleanJson);

    const { error: finalUpdateErr } = await supabase.from("repository_insights").update({
      ai_summary: parsed.ai_summary,
      health_indicators: parsed.health_indicators,
      status: 'completed',
      analyzed_commit_sha: latestCommit,
      updated_at: new Date().toISOString()
    }).eq("repository_id", repoId);
    
    if (finalUpdateErr) {
      console.error(`[chronocode-api] Final update failed for ${repoId}:`, finalUpdateErr);
    } else {
      console.log(`[chronocode-api] AI Insights generated and saved for repo ${repoId}`);
    }
  } catch (error) {
    console.error("[chronocode-api] Failed to generate background insights:", error);
    await supabase.from("repository_insights").update({ status: 'error' }).eq("repository_id", repoId);
  }
}
