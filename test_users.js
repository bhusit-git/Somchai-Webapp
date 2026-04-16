import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.from('users').select('id, name, full_name, role, branch_id');
  console.log("Error:", error);
  console.log("Total users:", data.length);
  if (data.length > 0) {
     console.log("Sample users:", data.slice(0, 3));
  }
}
run();
