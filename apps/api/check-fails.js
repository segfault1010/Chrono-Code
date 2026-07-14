require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('repositories').select('*').eq('status', 'verification_failed').then(r => {
    if (r.error) console.error(r.error);
    else {
        r.data.forEach(repo => console.log(`${repo.owner}/${repo.name}: ${repo.error_message}`));
    }
});
