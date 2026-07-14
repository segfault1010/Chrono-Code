-- 011_evolution_sampling.sql

-- Drop the function if it exists to allow re-running
DROP FUNCTION IF EXISTS get_sampled_evolution(uuid, integer);

-- Create a robust time-based sampling function for Code Evolution
CREATE OR REPLACE FUNCTION get_sampled_evolution(match_repo_id uuid, max_samples integer DEFAULT 1000)
RETURNS TABLE (
  sha text,
  message text,
  author_name text,
  authored_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  min_time timestamp with time zone;
  max_time timestamp with time zone;
  total_duration float8;
  bucket_interval float8;
BEGIN
  -- Get the full time span of the repository
  SELECT MIN(c.authored_at), MAX(c.authored_at)
  INTO min_time, max_time
  FROM commits c
  WHERE c.repo_id = match_repo_id;

  -- If no commits exist, return empty
  IF min_time IS NULL THEN
    RETURN;
  END IF;

  -- Calculate total duration in seconds
  total_duration := EXTRACT(EPOCH FROM (max_time - min_time));
  
  -- Prevent divide by zero if all commits are in the same exact second
  IF total_duration <= 0 THEN
    RETURN QUERY
      SELECT c.sha, c.message, c.author_name, c.authored_at
      FROM commits c
      WHERE c.repo_id = match_repo_id
      ORDER BY c.authored_at ASC;
    RETURN;
  END IF;

  -- Calculate bucket size in seconds
  bucket_interval := total_duration / max_samples;

  -- Build the sampled result set
  RETURN QUERY
  WITH RankedCommits AS (
    SELECT 
      c.sha, 
      c.message, 
      c.author_name, 
      c.authored_at,
      -- Assign a time bucket to each commit
      FLOOR(EXTRACT(EPOCH FROM (c.authored_at - min_time)) / bucket_interval) AS bucket_index,
      -- Pick the earliest commit in each bucket
      ROW_NUMBER() OVER (
        PARTITION BY FLOOR(EXTRACT(EPOCH FROM (c.authored_at - min_time)) / bucket_interval) 
        ORDER BY c.authored_at ASC
      ) as rn,
      -- Check if it is a major milestone/release
      CASE 
        WHEN c.message ILIKE 'v[0-9]%' THEN true
        WHEN c.message ILIKE 'release%' THEN true
        WHEN c.message ILIKE '%bump version%' THEN true
        WHEN c.authored_at = min_time THEN true -- First commit
        WHEN c.authored_at = max_time THEN true -- Last commit
        ELSE false
      END as is_milestone
    FROM commits c
    WHERE c.repo_id = match_repo_id
  )
  SELECT 
    r.sha, 
    r.message, 
    r.author_name, 
    r.authored_at
  FROM RankedCommits r
  -- Always include milestones/first/last, plus the first commit of each time bucket
  WHERE r.rn = 1 OR r.is_milestone = true
  ORDER BY r.authored_at ASC;

END;
$$;
