import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase Creds in env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
  console.log('Seeding initial data...');
  
  // 1. Create a branch
  const { data: branchData, error: branchError } = await supabase
    .from('branches')
    .insert([{ name: 'สาขา 1 (NightZone)', address: '123 สมชายหมูปิ้ง' }])
    .select();
    
  if (branchError) {
    console.error('Error creating branch:', branchError);
    return;
  }
  
  const branchId = branchData[0].id;
  console.log('Created branch:', branchData[0].name);

  // 2. Create users
  const usersToInsert = [
    {
      branch_id: branchId,
      name: 'สมชาย (Owner)',
      full_name: 'สมชาย (Owner)',
      role: 'owner',
      pin_hash: '111111'
    },
    {
      branch_id: branchId,
      name: 'สมศรี (Manager)',
      full_name: 'สมศรี (Manager)',
      role: 'manager',
      pin_hash: '222222'
    },
    {
      branch_id: branchId,
      name: 'พนักงาน A',
      full_name: 'พนักงาน A',
      role: 'staff',
      pin_hash: '333333'
    }
  ];

  const { data: userData, error: userError } = await supabase
    .from('users')
    .insert(usersToInsert)
    .select();

  if (userError) {
    console.error('Error creating users:', userError);
    return;
  }

  console.log(`Created ${userData.length} users successfully!`);
}

seed();
