-- =========================================================
-- รวมชุดคำสั่งอัปเดตฐานข้อมูล (Database Migrations)
-- นำโค้ดทั้งหมดนี้ไปรันใน Supabase SQL Editor ครั้งเดียวได้เลยครับ
-- =========================================================

-- 1. เพิ่ม Column ให้ตาราง users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS employee_id TEXT;

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS pay_cycle text DEFAULT 'monthly'
CHECK (pay_cycle IN ('daily','bimonthly','monthly'));

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS daily_cash_advance NUMERIC(10, 2) DEFAULT 0;

-- 2. เพิ่ม Column สำหรับกำหนดเรทค่าจ้างรายสัปดาห์ (แยกแต่ละวัน)
-- รูปแบบ JSON : {"0": 500, "1": 400, "2": 400, "3": 400, "4": 400, "5": 400, "6": 500}
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS custom_rates JSONB DEFAULT NULL;


-- 3. สร้างตารางลูกค้าเครดิต (Credit Customers)
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id),
    name TEXT NOT NULL,
    company TEXT,
    phone TEXT,
    tax_id TEXT,
    ar_reminder_days INTEGER DEFAULT 30,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ถ้ายกเลิก RLS ไม่ได้ ก็สร้าง Policy ไว้สำหรับการ Development อย่างเดียว
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  -- พยายามลบ Policy เดิมก่อนเพื่อป้องกันการซ้ำซ้อน (ถ้ายังไม่เคยมียังไม่พัง)
  DROP POLICY IF EXISTS "customers_select" ON public.customers;
  DROP POLICY IF EXISTS "customers_insert" ON public.customers;
  DROP POLICY IF EXISTS "customers_update" ON public.customers;
  DROP POLICY IF EXISTS "customers_delete" ON public.customers;
END $$;

CREATE POLICY "customers_select" ON public.customers FOR SELECT USING (true);
CREATE POLICY "customers_insert" ON public.customers FOR INSERT WITH CHECK (true);
CREATE POLICY "customers_delete" ON public.customers FOR DELETE USING (true);

-- 4. เตรียมฟีเจอร์สำหรับ Advance Shift Settings & Monthly schedules
-- เพิ่มคอลัมน์ settings โครงสร้าง JSONB เช่น {"shift_times": ..., "late_tolerance_minutes": 15}
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;

-- เพิ่ม flag is_late ในตารางรายงานผลเข้างาน
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS is_late BOOLEAN DEFAULT FALSE;
-- 5. เพิ่มประเภทกะ "กะเย็น" และ "กะดึก" อัปเดตเงื่อนไขตาราง
ALTER TABLE public.employee_schedules DROP CONSTRAINT IF EXISTS employee_schedules_shift_type_check;
ALTER TABLE public.employee_schedules ADD CONSTRAINT employee_schedules_shift_type_check CHECK (shift_type IN ('morning', 'afternoon', 'evening', 'night', 'fullday'));

-- 6. เพิ่มประเภทกะในตารางเก็บเวลาเข้าออกเพื่อแสดงในประวัติ
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS shift_type TEXT;
