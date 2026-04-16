import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const branchId = '5d0d17b9-74ba-4eef-80ab-05c65687f444'; // Use the branch_id from before
  const selectedMonth = '2026-03';
  const selectedChannel = 'Lineman'; // This is what is passed
  
  const [year, month] = selectedMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const dateStart = `${selectedMonth}-01T00:00:00+07:00`;
  const dateEnd = `${selectedMonth}-${String(daysInMonth).padStart(2, '0')}T23:59:59+07:00`;

  console.log(`Querying between ${dateStart} and ${dateEnd}`);

  const { data: txData, error } = await supabase
    .from('transactions')
    .select('total, payment_method, shift_id, created_at, status')
    .eq('branch_id', branchId)
    .gte('created_at', dateStart)
    .lte('created_at', dateEnd);

  if (error) {
    console.error(error);
    return;
  }
  const txAll = txData || [];
  console.log(`Fetched ${txAll.length} transactions`);

  const dailyExpected = {};
  txAll.forEach(tx => {
    const d = new Date(tx.created_at);
    const localDate = new Date(d.getTime() + 7 * 60 * 60 * 1000).toISOString().split('T')[0];

    if (selectedChannel.toLowerCase() === 'cash') {
      if (tx.payment_method?.toLowerCase() !== 'cash') return;
    } else {
      if (tx.payment_method?.toLowerCase() !== selectedChannel.toLowerCase()) return;
    }

    if (!dailyExpected[localDate]) dailyExpected[localDate] = 0;
    
    const total = Number(tx.total || 0);
    if (total < 0) {
      dailyExpected[localDate] += total;
    } else if (tx.status === 'completed') {
      dailyExpected[localDate] += total;
    }
  });

  console.log('Daily Expected:', dailyExpected);
}

run();
