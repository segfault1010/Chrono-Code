// ============================================================================
// Supabase Database Client
// Single shared instance for all database operations.
// ============================================================================

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || (!SUPABASE_SERVICE_ROLE_KEY && !SUPABASE_ANON_KEY)) {
  console.error("[chronocode-api] FATAL: SUPABASE_URL or a Supabase Key is not set. Database operations will fail. Set these in your .env file.");
  process.exit(1);
}

/**
 * Shared Supabase client instance.
 * Uses the service role key to bypass RLS if available, falling back to anon key.
 */
export const supabase: SupabaseClient = createClient(
  SUPABASE_URL || "https://placeholder.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY || "placeholder-key"
);
