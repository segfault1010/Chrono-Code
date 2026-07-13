const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://kkxiiryfnlexpvdhsdfh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ysN_5gxnlZIvbR9zjtDgZg_d4Kk8EFd";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
  const { data, error } = await supabase.from('repositories').select('id, name, indexed_commits, total_commits');
  if (error) console.error(error);
  console.log(data);
}
test();
