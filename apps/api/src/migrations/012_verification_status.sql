-- Migration: Add verification status and reason to repositories table

ALTER TABLE repositories
ADD COLUMN verification_status text CHECK (verification_status IN ('pending', 'passed', 'failed', 'warning')) DEFAULT 'pending',
ADD COLUMN verification_reason text;
