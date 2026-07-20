-- Migration: Add pipeline_state JSONB column to repositories table
-- Description: Stores the weighted dependency graph pipeline state for accurate progress reporting

ALTER TABLE public.repositories
ADD COLUMN IF NOT EXISTS pipeline_state JSONB DEFAULT NULL;
