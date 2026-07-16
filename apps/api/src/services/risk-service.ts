import { supabase } from "../lib/db";
import { model } from "../lib/gemini";
import type { Response } from "express";
import { sanitizeSecrets } from "../lib/sanitize";

const SYSTEM_PROMPT = `You are a Senior Security & Architecture Auditor.
Given a list of commit messages, analyze them for potential risks, breaking changes, architectural shifts, and security implications.

Guidelines:
1. Identify high-risk commits (e.g., core API changes, DB schema migrations, major refactors, sensitive dependency updates).
2. Flag potential breaking changes explicitly.
3. Group findings into categories: 🚨 Breaking Changes, ⚠️ High Risk / Security, 🏗️ Architectural Shifts.
4. If the commits look completely routine and safe, explicitly state: "No major risks or breaking changes detected in this range."
5. Output structured, professional Markdown. Mention the commit SHA and Author for each flagged risk.
6. Do not fabricate risks if none exist.`;

export async function streamRiskAnalysis(repoId: string, range: string, res: Response): Promise<void> {
  // Set SSE Headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    let query = supabase
      .from("commits")
      .select("sha, message, author_name, authored_at")
      .eq("repo_id", repoId)
      .order("authored_at", { ascending: false });

    // Apply range filter
    if (range === "last_7_days") {
      const date = new Date();
      date.setDate(date.getDate() - 7);
      query = query.gte("authored_at", date.toISOString());
      query = query.limit(200); // safety cap
    } else if (range === "last_30_days") {
      const date = new Date();
      date.setDate(date.getDate() - 30);
      query = query.gte("authored_at", date.toISOString());
      query = query.limit(500); // safety cap
    } else {
      // Default to last 50
      query = query.limit(50);
    }

    const { data: commits, error } = await query;

    if (error || !commits) {
      res.write(`data: ${JSON.stringify({ error: "Failed to fetch commits" })}\n\n`);
      res.end();
      return;
    }

    if (commits.length === 0) {
      res.write(`data: ${JSON.stringify({ text: "No commits found in this range to analyze." })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
      return;
    }

    // Format commits for the prompt
    const commitList = commits.map(c => `- [${c.sha.substring(0, 7)}] ${c.message.split('\n')[0]} (by ${c.author_name})`).join('\n');

    const rawPrompt = `${SYSTEM_PROMPT}\n\n=== Raw Commits ===\n${commitList}\n\nPlease generate the Risk Analysis Report:`;
    const prompt = sanitizeSecrets(rawPrompt);

    const resultStream = await model.generateContentStream(prompt);
    
    for await (const chunk of resultStream.stream) {
      const chunkText = chunk.text();
      res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    console.error(`[chronocode-api] Failed to generate risk analysis for repo ${repoId}:`, err);
    res.write(`data: ${JSON.stringify({ error: "Failed to generate risk analysis" })}\n\n`);
    res.end();
  }
}
