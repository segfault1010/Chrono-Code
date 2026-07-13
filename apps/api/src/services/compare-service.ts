import { model } from "../lib/gemini";
import type { RepositoryJourney, RepositoryComparison } from "@chronocode/shared-types";
import { supabase } from "../lib/db";

const SYSTEM_PROMPT = `You are a senior software architect analyzing and comparing two codebases based on their evolutionary journeys.
Your goal is to contrast their histories, architectural maturity, development velocity, and highlight key differences in how they evolved.

Format your output EXACTLY as a JSON object matching this schema:
{
  "ai_summary": "A concise 2-3 paragraph comparison describing how these two projects differ in terms of evolution, health, and engineering practices. Do not use markdown headers."
}

DO NOT output markdown formatting blocks like \`\`\`json. ONLY output the raw JSON object.`;

export async function getOrGenerateComparisonInsights(
  repo1Id: string, 
  repo2Id: string, 
  journey1: RepositoryJourney, 
  journey2: RepositoryJourney, 
  forceRefresh: boolean = false
): Promise<Partial<RepositoryComparison>> {
  const [r1, r2] = [repo1Id, repo2Id].sort();

  if (!forceRefresh) {
    const { data: existing, error: fetchErr } = await supabase
      .from("repository_comparisons")
      .select("*")
      .eq("repo1_id", r1)
      .eq("repo2_id", r2)
      .maybeSingle();

    if (existing) {
      if (existing.status === 'completed') {
        return {
          status: 'completed',
          updated_at: existing.updated_at,
          ai_summary: existing.ai_summary,
        };
      }
      if (existing.status === 'generating') {
        return { status: 'generating' };
      }
      if (existing.status === 'error') {
        return { status: 'error', error_message: existing.error_message || "Failed to generate comparison." };
      }
    }
  }

  // Insert or mark as generating
  const { error: upsertErr } = await supabase.from("repository_comparisons").upsert({
    repo1_id: r1,
    repo2_id: r2,
    status: 'generating',
    updated_at: new Date().toISOString()
  }, { onConflict: 'repo1_id,repo2_id' });

  if (upsertErr) {
    console.error(`[compare-service] Upsert error:`, upsertErr);
  }

  // Run in background
  generateComparisonInBackground(r1, r2, journey1, journey2).catch(err => {
    console.error("[compare-service] Background generation failed:", err);
    supabase.from("repository_comparisons").update({ status: 'error' }).eq("repo1_id", r1).eq("repo2_id", r2).then();
  });

  return { status: 'generating' };
}

async function generateComparisonInBackground(r1: string, r2: string, j1: RepositoryJourney, j2: RepositoryJourney) {
  try {
    const promptData = {
      repo1: {
        repository_stats: j1.stats,
        phases: j1.phases.map(p => p.name),
        top_milestones: j1.milestones.sort((a, b) => b.impact_score - a.impact_score).slice(0, 5).map(m => m.message.split('\n')[0]),
      },
      repo2: {
        repository_stats: j2.stats,
        phases: j2.phases.map(p => p.name),
        top_milestones: j2.milestones.sort((a, b) => b.impact_score - a.impact_score).slice(0, 5).map(m => m.message.split('\n')[0]),
      }
    };

    const prompt = `Compare these two repositories based on this data:\n${JSON.stringify(promptData, null, 2)}`;
    
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0.2,
      },
    });

    let text = result.response.text();
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    
    const parsed = JSON.parse(text);

    await supabase.from("repository_comparisons").update({
      status: 'completed',
      ai_summary: parsed.ai_summary,
      updated_at: new Date().toISOString()
    }).eq("repo1_id", r1).eq("repo2_id", r2);

  } catch (error: any) {
    console.error("[compare-service] Error generating comparison:", error);
    let errorMessage = "An unknown error occurred during AI generation.";
    if (error?.status === 429) {
      errorMessage = "AI Quota Exceeded. Please try again later.";
    } else if (error?.message) {
      errorMessage = error.message;
    }
    
    await supabase.from("repository_comparisons").update({
      status: 'error',
      error_message: errorMessage,
      updated_at: new Date().toISOString()
    }).eq("repo1_id", r1).eq("repo2_id", r2);
  }
}
