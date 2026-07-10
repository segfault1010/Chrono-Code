-- Enable the pgvector extension to work with embedding vectors
CREATE EXTENSION IF NOT EXISTS vector;

-- Add an embedding column to the commit_explanations table.
-- Gemini gemini-embedding-2 model outputs 3072 dimensions.
ALTER TABLE commit_explanations ADD COLUMN IF NOT EXISTS embedding vector(3072);

-- Create a Postgres function (RPC) to perform cosine similarity search
-- It joins with commits to return full commit details along with the explanation.
CREATE OR REPLACE FUNCTION match_commits (
  query_embedding vector(3072),
  match_repo_id uuid,
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  sha text,
  message text,
  author_name text,
  authored_at timestamptz,
  explanation text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.sha,
    c.message,
    c.author_name,
    c.authored_at,
    ce.explanation,
    1 - (ce.embedding <=> query_embedding) AS similarity
  FROM
    commit_explanations ce
  JOIN
    commits c ON c.sha = ce.sha
  WHERE
    c.repo_id = match_repo_id
    AND ce.embedding IS NOT NULL
    AND 1 - (ce.embedding <=> query_embedding) > match_threshold
  ORDER BY
    ce.embedding <=> query_embedding
  LIMIT
    match_count;
END;
$$;
