import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const query = `
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS employee_id TEXT;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS pay_cycle text DEFAULT 'monthly';
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS daily_cash_advance NUMERIC(10, 2) DEFAULT 0;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS custom_rates JSONB DEFAULT NULL;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS id_card_number TEXT;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS position_allowance NUMERIC(10, 2) DEFAULT 0;
  `;
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: query });
  
  if (error) {
    console.error('Error running RPC (if exec_sql is not defined, we cannot run arbitrary SQL from client):', error.message);
  } else {
    console.log('Schema fixed successfully via RPC.');
  }
}
run();
