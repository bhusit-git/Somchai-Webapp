import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function fix() {
  const { data: arData } = await supabase
    .from('accounts_receivable')
    .select('id, created_at, transaction_id, transactions(created_at, order_number)');

  for (const ar of (arData || [])) {
    if (ar.transactions && ar.transactions.created_at) {
      if (ar.created_at !== ar.transactions.created_at) {
        await supabase.from('accounts_receivable')
          .update({ created_at: ar.transactions.created_at })
          .eq('id', ar.id);
        console.log('Fixed AR', ar.id, 'to date', ar.transactions.created_at);
      } else {
        console.log('AR', ar.id, 'already matched', ar.transactions.order_number, ar.created_at);
      }
    }
  }
}

fix();
