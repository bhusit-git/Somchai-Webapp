import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if(!supabaseUrl || !supabaseKey) {
  console.log("Missing Supabase Creds in env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: "ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE; ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS delete_reason TEXT; ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;" });
  if (error) {
    if(error.message.includes('function exec_sql() does not exist')) {
        console.log('Cannot run raw SQL. Creating employee_id using normal update if possible or it needs manual backend change');
    } else {
        console.error('Error:', error);
    }
  }
  else console.log('Success:', data);
}
run();
