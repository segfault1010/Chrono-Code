require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function fix() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  // 1. Find all failed repos
  const { data: failedRepos } = await supabase.from('repositories').select('*').eq('status', 'verification_failed');
  if (!failedRepos) return;

  for (const repo of failedRepos) {
    if (repo.name === 'Chrono-Code') {
      console.log('Resetting Chrono-Code for full re-index...');
      await supabase.from('commits').delete().eq('repo_id', repo.id);
      await supabase.from('repositories').update({
        indexed_commits: 0,
        indexing_progress: 0,
        last_indexed_sha: null,
        status: 'ready',
        error_message: null
      }).eq('id', repo.id);
    } else {
      console.log(`Resetting status to ready for ${repo.name}...`);
      await supabase.from('repositories').update({
        status: 'ready',
        error_message: null
      }).eq('id', repo.id);
    }
  }
}

fix().catch(console.error);
