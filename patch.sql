-- เรียกใช้ Script นี้ใน Supabase SQL Editor เพื่อเพิ่ม Column pay_cycle สำหรับพนักงาน
-- โดยที่ pay_cycle จะเก็บรอบจ่ายเงินเดือน 3 แบบคือ:
-- 1. daily (จ่ายทุกวัน)
-- 2. bimonthly (จ่ายครึ่งเดือน 1 และ 16)
-- 3. monthly (จ่ายสิ้นเดือน) - เป็นค่าเริ่มต้น

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS pay_cycle text DEFAULT 'monthly'
CHECK (pay_cycle IN ('daily','bimonthly','monthly'));

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS daily_cash_advance NUMERIC(10, 2) DEFAULT 0;

-- หากต้องการแก้ไขข้อมูลเบื้องต้นให้ทดสอบ สามารถรัน Update ได้ (ตัวอย่าง)
-- UPDATE public.users SET pay_cycle = 'daily' WHERE employment_type = 'daily';
