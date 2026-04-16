import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const sql_query = `
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS misc_cost_type VARCHAR(50) DEFAULT 'PERCENT';
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS misc_cost_value DECIMAL(10,2) DEFAULT 0;
  `;
  const { data, error } = await supabase.rpc('exec_sql', { sql_query });
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Success:', data);
    
    // Also, tell supabase to refresh the schema cache since the error says "Could not find ... in the schema cache".
    // Alternatively, the frontend will automatically fetch it again or might need a reload.
  }
}
run();
