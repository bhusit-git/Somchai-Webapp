import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, created_at, status, total, branch_id')
    .lte('created_at', '2026-03-31T23:59:59+07:00')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log("Error:", error);
  console.log("Found transactions:", data?.length);
  if (data?.length > 0) {
    console.log(data);
  } else {
    // Maybe check if any transactions exist at all
    const { data: allData } = await supabase.from('transactions').select('id, created_at').limit(1);
    console.log("Any transactions in DB?", allData);
  }
}

check();
