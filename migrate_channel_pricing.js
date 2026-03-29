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
  const sql = `
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS channel_prices JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS sales_channel TEXT DEFAULT 'dine_in';
  `;
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
  if (error) {
    console.error('Error:', error.message);
    // Fallback: try individual column additions via normal API
    console.log('Trying fallback approach...');
    // Test if columns exist by reading them
    const { data: testProd } = await supabase.from('products').select('channel_prices').limit(1);
    if (testProd) console.log('✅ products.channel_prices already exists');
    else console.log('⚠️ products.channel_prices needs manual creation');
    
    const { data: testTx } = await supabase.from('transactions').select('sales_channel').limit(1);
    if (testTx) console.log('✅ transactions.sales_channel already exists');
    else console.log('⚠️ transactions.sales_channel needs manual creation');
  } else {
    console.log('✅ Migration successful:', data);
  }
}
run();
