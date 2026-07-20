require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase.from('repository_insights').select('*');
  console.log('Insights:', data);
  const { data: repos, error: err2 } = await supabase.from('repositories').select('id, status');
  console.log('Repos:', repos);
  
  const { data: analytics, error: err3 } = await supabase.from('repository_analytics').select('repo_id, status, analytics_type');
  console.log('Analytics:', analytics);
}

check().catch(console.error);
