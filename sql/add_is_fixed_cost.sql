-- =============================================
-- Migration: เพิ่ม is_fixed_cost ให้ expense_categories
-- วัตถุประสงค์: ระบุว่าหมวดหมู่รายจ่ายใดเป็น "ต้นทุนคงที่" (Fixed Cost)
-- เช่น ค่าเช่าร้าน, เงินเดือนพนักงานประจำ
-- =============================================

ALTER TABLE expense_categories
  ADD COLUMN IF NOT EXISTS is_fixed_cost BOOLEAN DEFAULT false;

-- Comment: ตั้งค่าหมวดหมู่ที่เป็นต้นทุนคงที่ ผ่านหน้า Settings → หมวดหมู่รายจ่าย
-- ระบบ Profit Dashboard จะดึงข้อมูลจาก expenses table โดยอัตโนมัติ
-- แยกเป็น OPEX (is_fixed_cost=false) และ Fixed Cost (is_fixed_cost=true)
