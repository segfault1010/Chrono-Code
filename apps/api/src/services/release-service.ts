import { supabase } from "../lib/db";
import { flashModel } from "../lib/gemini";
import type { Response } from "express";
import { sanitizeSecrets } from "../lib/sanitize";

const SYSTEM_PROMPT = `You are a Technical Writer and Senior Developer.
Given a list of commit messages, generate a professional, well-structured Markdown Release Notes document.

Guidelines:
1. Group the commits into logical sections: 🚀 Features, 🐛 Bug Fixes, 🛠️ Maintenance & Refactoring.
2. Translate raw, messy commit messages into clear, user-facing descriptions.
3. Ignore trivial commits (e.g., "typo fix", "merge branch") unless they are important.
4. Output ONLY the markdown. Do not include a conversational intro or outro.
5. Add a brief, 1-2 sentence high-level summary at the very beginning.`;

export async function streamReleaseNotes(repoId: string, range: string, res: Response): Promise<void> {
  // Set SSE Headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    let query = supabase
      .from("commits")
      .select("sha, message, author_name")
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
      res.write(`data: ${JSON.stringify({ text: "No commits found in this range." })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
      return;
    }

    // Format commits for the prompt
    const commitList = commits.map(c => `- [${c.sha.substring(0, 7)}] ${c.message} (by ${c.author_name})`).join('\n');

    const rawPrompt = `${SYSTEM_PROMPT}\n\n=== Raw Commits ===\n${commitList}\n\nPlease generate the Release Notes:`;
    const prompt = sanitizeSecrets(rawPrompt);

    const resultStream = await flashModel.generateContentStream(prompt);
    
    for await (const chunk of resultStream.stream) {
      const chunkText = chunk.text();
      res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    console.error(`[chronocode-api] Failed to generate release notes for repo ${repoId}:`, err);
    res.write(`data: ${JSON.stringify({ error: "Failed to generate release notes" })}\n\n`);
    res.end();
  }
}
