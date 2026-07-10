import { supabase } from "../lib/db";
import { model } from "../lib/gemini";
import { Response } from "express";

const SYSTEM_PROMPT = `You are a Senior Technical Writer generating automated release notes.
Given a list of commit messages, categorize them into a beautifully structured Markdown document.

Guidelines:
1. Group by semantic categories (e.g., ✨ Features, 🐛 Bug Fixes, 🛠️ Chores/Maintenance, 📖 Documentation).
2. Rewrite technical, messy commit messages into clear, user-friendly bullet points.
3. Keep the tone professional, concise, and celebratory.
4. Mention the authors of the commits to give them credit.
5. Do not invent features or fixes that are not present in the commits.
6. The output should be pure Markdown, ready to be rendered on a website.`;

export async function streamReleaseNotes(repoId: string, range: string, res: Response): Promise<void> {
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
      res.write(`data: ${JSON.stringify({ text: "No commits found in this range." })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
      return;
    }

    // Format commits for the prompt
    const commitList = commits.map(c => `- [${c.sha.substring(0, 7)}] ${c.message.split('\n')[0]} (by ${c.author_name})`).join('\n');

    const prompt = `${SYSTEM_PROMPT}\n\n=== Raw Commits ===\n${commitList}\n\nPlease generate the release notes:`;

    const resultStream = await model.generateContentStream(prompt);
    
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
