require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.from('expense_categories').select('*');
  if (error) console.error(error);
  console.log(JSON.stringify(data, null, 2));
}
run();
