-- Migration 008: Repository Comparisons
CREATE TABLE IF NOT EXISTS repository_comparisons (
  id uuid primary key default uuid_generate_v4(),
  repo1_id uuid references repositories(id) on delete cascade not null,
  repo2_id uuid references repositories(id) on delete cascade not null,
  ai_summary text,
  status text not null default 'queued', -- queued, generating, completed, error
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  unique(repo1_id, repo2_id)
);

-- RLS
ALTER TABLE repository_comparisons ENABLE ROW LEVEL SECURITY;

-- Allow read access to anyone
CREATE POLICY "Repository comparisons are viewable by everyone" ON repository_comparisons
  FOR SELECT USING (true);
