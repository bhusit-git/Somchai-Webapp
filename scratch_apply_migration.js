import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
    const sql = fs.readFileSync('./migrations/migrate_app_settings.sql', 'utf8');
    console.log('Applying migration...');
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
        console.error('Migration failed:', error.message);
        if (error.message.includes('function exec_sql()')) {
            console.log('ACTION REQUIRED: Please copy the content of ./migrations/migrate_app_settings.sql and run it in your Supabase SQL Editor.');
        }
    } else {
        console.log('Migration applied successfully:', data);
    }
}

applyMigration();
