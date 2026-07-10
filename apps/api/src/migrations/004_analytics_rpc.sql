-- RPC to get top contributors for a repo
CREATE OR REPLACE FUNCTION get_top_contributors(match_repo_id uuid, limit_count int DEFAULT 10)
RETURNS TABLE (
  author_name text,
  commit_count bigint
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.author_name,
    COUNT(*) AS commit_count
  FROM
    commits c
  WHERE
    c.repo_id = match_repo_id
  GROUP BY
    c.author_name
  ORDER BY
    commit_count DESC
  LIMIT
    limit_count;
END;
$$;

-- RPC to get commit activity timeline (commits per day)
CREATE OR REPLACE FUNCTION get_commit_activity(match_repo_id uuid, days_limit int DEFAULT 30)
RETURNS TABLE (
  activity_date date,
  commit_count bigint
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(c.authored_at) AS activity_date,
    COUNT(*) AS commit_count
  FROM
    commits c
  WHERE
    c.repo_id = match_repo_id
    AND c.authored_at >= NOW() - (days_limit || ' days')::interval
  GROUP BY
    DATE(c.authored_at)
  ORDER BY
    activity_date ASC;
END;
$$;
