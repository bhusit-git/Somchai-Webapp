import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("Missing env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testFetch() {
  const { data, error } = await supabase
    .from('transactions')
    .select(`
      id, total, status,
      accounts_receivable ( * )
    `)
    .eq('payment_method', 'credit')
    .limit(5);
  
  if (error) console.error("Error:", error);
  else console.log("Data:", JSON.stringify(data, null, 2));
}

testFetch();
