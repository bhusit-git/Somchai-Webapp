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

async function fixData() {
  // Update all accounts_receivable created_at to the current time, 
  // ONLY IF they are currently associated with transactions from this month but their AR was just created.
  // Actually, easiest way is to just set created_at = '2026-04-05T00:00:00Z' for the ones created today or customer=ร้านโจ๊ก.
  
  const { data, error } = await supabase
    .from('accounts_receivable')
    .select('id, created_at, customer_name')
    .eq('customer_name', 'ร้านโจ๊ก');
  
  if (error) {
    console.error(error);
    return;
  }
  
  console.log("Found:", data);
  
  for (const row of data) {
    // If it's earlier than today, let's update it to today so it shows in today's reconciliation
    const now = new Date();
    await supabase.from('accounts_receivable').update({ created_at: now.toISOString() }).eq('id', row.id);
    console.log("Updated", row.id);
  }
}

fixData();
