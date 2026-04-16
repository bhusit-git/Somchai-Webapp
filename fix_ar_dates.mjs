import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('accounts_receivable')
    .select('id, created_at, customer_name, total_amount')
    .eq('customer_name', 'ร้านโจ๊ก');
    
  console.log("Found:", data);
}
run();
