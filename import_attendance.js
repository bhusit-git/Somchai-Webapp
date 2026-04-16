import fs from 'fs';
import csv from 'csv-parser';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const csvPath = '/Users/bhusitt./Downloads/ระบบบัญชีหน้าหมูปิ้ง - Timesheet.csv';

function getFakeTime(type, shift) {
    if (shift === 'ช่วงเช้า') return type === 'clock_in' ? '06:00:00' : '12:00:00';
    if (shift === 'ช่วงบ่าย') return type === 'clock_in' ? '12:00:00' : '18:00:00';
    if (shift === 'ช่วงเย็น') return type === 'clock_in' ? '18:00:00' : '23:59:00';
    return type === 'clock_in' ? '08:00:00' : '17:00:00';
}

async function run() {
  console.log('Fetching users and branches metadata...');
  
  const { data: users, error: uErr } = await supabase.from('users').select('id, name, full_name, employee_id');
  if (uErr) throw uErr;
  
  const { data: branches, error: bErr } = await supabase.from('branches').select('id, name, code');
  if (bErr) throw bErr;

  console.log(`Loaded ${users.length} users and ${branches.length} branches`);

  const results = [];
  fs.createReadStream(csvPath)
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      console.log(`Parsed ${results.length} rows from CSV.`);
      
      let successCount = 0;
      let errors = [];

      for (let i = 0; i < results.length; i++) {
        const row = results[i];
        
        // Handle variations in column names if any (e.g. trailing spaces)
        const getKey = (keyName) => {
            const keys = Object.keys(row);
            const foundKey = keys.find(k => k.trim() === keyName);
            return foundKey ? row[foundKey] : null;
        }

        const timestampRaw = getKey('Timestamp') || '';
        const empRaw = getKey('รหัสพนักงาน') || '';
        const branchRaw = getKey('สาขา') || '';
        const clockRaw = getKey('ประเภทการลงเวลา') || '';
        const shiftRaw = getKey('รอบเวลาทำงาน') || '';
        const noteRaw = getKey('หมายเหตุ') || '';
        const ownerRemark = getKey('Remark by Owner') || '';

        if (!empRaw && !timestampRaw) continue; // Skip empty rows

        // --- Parse User ---
        let userId = null;
        const foundUser = users.find(u => {
            if (u.employee_id && empRaw.includes(u.employee_id)) return true;
            if (u.name && empRaw.includes(u.name)) return true;
            return false;
        });
        if (foundUser) userId = foundUser.id;

        // --- Parse Branch ---
        let branchId = branches[0]?.id; // default
        const foundBranch = branches.find(b => branchRaw.includes(b.code) || branchRaw.includes(b.name));
        if (foundBranch) branchId = foundBranch.id;

        // --- Parse Type ---
        const clockType = clockRaw.includes('ออกงาน') ? 'clock_out' : 'clock_in';

        // --- Parse Shift Type ---
        let shiftType = 'morning';
        if (shiftRaw === 'ช่วงบ่าย') shiftType = 'afternoon';
        else if (shiftRaw === 'ช่วงเย็น') shiftType = 'evening';
        else if (shiftRaw.includes('ดึก')) shiftType = 'night';

        const finalNote = [noteRaw, ownerRemark].filter(x => x).join(' | ');

        // --- Parse Date and synthesize Time ---
        let finalTimestampIso = new Date().toISOString();
        if (timestampRaw) {
            // Some timestamps might have time "1/1/2026 6:24:03" or just "1/1/2026"
            const datePart = timestampRaw.split(' ')[0];
            const parts = datePart.split('/');
            
            if (parts.length >= 3) {
                const [d, m, y] = parts;
                
                let timePart = timestampRaw.split(' ')[1];
                if (!timePart) timePart = getFakeTime(clockType, shiftRaw);
                
                const isoStr = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${timePart}+07:00`;
                try {
                    const parsedDate = new Date(isoStr);
                    if (!isNaN(parsedDate.getTime())) {
                        finalTimestampIso = parsedDate.toISOString();
                    }
                } catch (err) {}
            }
        }

        if (!userId) {
            errors.push(`Row ${i+2}: Could not map employee -> ${empRaw}`);
            continue;
        }

        const payload = {
            user_id: userId,
            branch_id: branchId,
            type: clockType,
            shift_type: shiftType,
            note: finalNote || null,
            timestamp: finalTimestampIso,
            selfie_url: null,
            is_late: false,
            lat: null,
            lng: null
        };

        const { error } = await supabase.from('attendance').insert(payload);
        if (error) {
            errors.push(`Row ${i+2}: Failed insert -> ${error.message}`);
        } else {
            successCount++;
        }
      }

      console.log(`\n--- IMPORT SUMMARY ---`);
      console.log(`Successfully imported: ${successCount} records`);
      if (errors.length > 0) {
          console.log(`Errors encountered (${errors.length}):`);
          errors.slice(0, 15).forEach(e => console.log(e));
          if (errors.length > 15) console.log(`...and ${errors.length - 15} more.`);
      }
      process.exit(0);
    });
}

run().catch(console.error);
