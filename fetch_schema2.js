import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function main() {
  const { data, error } = await supabase.from('accounts_receivable').select('*').limit(1);
  console.log('accounts_receivable columns:', data && data.length > 0 ? Object.keys(data[0]) : []);
  
  const { data: tx, error: txErr } = await supabase.from('transactions').select('*').limit(1);
  console.log('transactions columns:', tx && tx.length > 0 ? Object.keys(tx[0]) : []);
}
main();
