require('ts-node').register();
const { supabase } = require('./src/lib/db');

async function fixStuckRepos() {
  const { data, error } = await supabase
    .from('repositories')
    .update({ status: 'analytics' })
    .eq('status', 'verifying');
    
  if (error) console.error(error);
  else console.log('Successfully fixed stuck verifying repos', data);
}

fixStuckRepos();
