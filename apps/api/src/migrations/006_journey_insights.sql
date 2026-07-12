-- 006_journey_insights.sql

CREATE TABLE repository_insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
    ai_summary TEXT,
    health_indicators JSONB,
    status TEXT NOT NULL DEFAULT 'generating', -- 'generating', 'completed', 'error'
    analyzed_commit_sha TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(repository_id)
);
