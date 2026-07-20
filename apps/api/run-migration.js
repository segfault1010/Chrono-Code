require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { error } = await supabase.rpc('exec_sql', { query: 'ALTER TABLE public.repositories ADD COLUMN IF NOT EXISTS pipeline_state JSONB DEFAULT NULL;' });
  if (error) {
    // If exec_sql doesn't exist, try just making a dummy insert or we can't run DDL via client easily
    console.error("RPC exec_sql failed:", error.message);
  } else {
    console.log("Migration applied via RPC.");
  }
}
main();
