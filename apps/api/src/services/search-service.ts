import { supabase } from "../lib/db";
import { embeddingModel } from "../lib/gemini";
import { createAppError } from "../middleware/error-handler";

export interface SearchMatch {
  sha: string;
  message: string;
  author_name: string;
  authored_at: string;
  explanation: string;
  similarity: number;
}

export async function semanticSearch(repoId: string, query: string, limit = 10, threshold = 0.5): Promise<SearchMatch[]> {
  // 1. Generate embedding for the search query
  let embeddingVector: number[];
  try {
    const embedResult = await embeddingModel.embedContent(query);
    embeddingVector = embedResult.embedding.values;
  } catch (err) {
    console.error(`[chronocode-api] Failed to embed search query:`, err);
    throw createAppError("Failed to process search query", 500);
  }

  // 2. Query the match_commits RPC in Supabase
  const { data, error } = await supabase.rpc("match_commits", {
    query_embedding: `[${embeddingVector.join(",")}]`,
    match_repo_id: repoId,
    match_threshold: threshold,
    match_count: limit,
  });

  if (error) {
    console.error(`[chronocode-api] Supabase search RPC error:`, error);
    throw createAppError("Database search failed", 500);
  }

  return data as SearchMatch[];
}
