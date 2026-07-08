// ============================================================================
// Supabase Database Client
// Single shared instance for all database operations.
// ============================================================================

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    "[chronocode-api] WARNING: SUPABASE_URL or SUPABASE_ANON_KEY is not set. " +
    "Database operations will fail. Set these in your .env file."
  );
}

/**
 * Shared Supabase client instance.
 * Uses the anon key for V1 (no RLS policies — all access is server-side).
 */
export const supabase: SupabaseClient = createClient(
  SUPABASE_URL || "https://placeholder.supabase.co",
  SUPABASE_ANON_KEY || "placeholder-key"
);
