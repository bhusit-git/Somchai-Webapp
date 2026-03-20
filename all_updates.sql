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

-- 7. อัปเกรดตาราง inventory_items จาก single-unit เป็น dual-unit schema
-- แก้ปัญหา: null value in column "unit" violates not-null constraint

-- เพิ่มคอลัมน์ใหม่ (ถ้ายังไม่มี)
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS purchase_unit  TEXT;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS stock_unit     TEXT;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS conversion_factor NUMERIC DEFAULT 1;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS yield_pct      NUMERIC DEFAULT 100;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS lead_time_days INTEGER DEFAULT 1;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS cost_per_stock_unit NUMERIC DEFAULT 0;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS reorder_point  NUMERIC DEFAULT 0;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS par_level      NUMERIC DEFAULT 0;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS current_stock  NUMERIC DEFAULT 0;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS is_active      BOOLEAN DEFAULT TRUE;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS sku            TEXT;

-- คัดลอกค่า unit เก่า → purchase_unit และ stock_unit (ถ้า unit column มีอยู่)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'inventory_items'
      AND column_name  = 'unit'
  ) THEN
    UPDATE public.inventory_items
    SET purchase_unit = unit,
        stock_unit    = unit
    WHERE purchase_unit IS NULL;
  END IF;
END $$;

-- กำหนด default ให้คอลัมน์ที่ยังเป็น NULL เพื่อให้ NOT NULL ทำงานถูกต้อง
UPDATE public.inventory_items SET purchase_unit = 'หน่วย' WHERE purchase_unit IS NULL;
UPDATE public.inventory_items SET stock_unit    = 'หน่วย' WHERE stock_unit IS NULL;

-- ตั้ง NOT NULL สำหรับคอลัมน์ที่จำเป็น
ALTER TABLE public.inventory_items ALTER COLUMN purchase_unit  SET NOT NULL;
ALTER TABLE public.inventory_items ALTER COLUMN stock_unit     SET NOT NULL;
ALTER TABLE public.inventory_items ALTER COLUMN conversion_factor SET NOT NULL;

-- ลบคอลัมน์เก่า (unit) ถ้ายังมีอยู่
ALTER TABLE public.inventory_items DROP COLUMN IF EXISTS unit;

-- 8. สร้าง/อัปเกรดตาราง grn_headers และ grn_items
-- แก้ปัญหา: Could not find the 'invoice_ref' column of 'grn_headers'

CREATE TABLE IF NOT EXISTS public.grn_headers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id     UUID REFERENCES public.branches(id),
  grn_number    TEXT NOT NULL,
  supplier_name TEXT,
  invoice_ref   TEXT,
  status        TEXT DEFAULT 'draft',
  total_value   NUMERIC DEFAULT 0,
  received_by   UUID REFERENCES public.users(id),
  received_at   TIMESTAMP WITH TIME ZONE,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- เพิ่มคอลัมน์ที่อาจขาดหาย (ถ้าตารางถูกสร้างไว้แล้วแบบเก่า)
ALTER TABLE public.grn_headers ADD COLUMN IF NOT EXISTS invoice_ref  TEXT;
ALTER TABLE public.grn_headers ADD COLUMN IF NOT EXISTS total_value  NUMERIC DEFAULT 0;
ALTER TABLE public.grn_headers ADD COLUMN IF NOT EXISTS received_at  TIMESTAMP WITH TIME ZONE;

CREATE TABLE IF NOT EXISTS public.grn_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id              UUID REFERENCES public.grn_headers(id) ON DELETE CASCADE,
  inventory_item_id   UUID REFERENCES public.inventory_items(id),
  qty_purchase        NUMERIC NOT NULL,
  qty_stock           NUMERIC NOT NULL,
  unit_cost           NUMERIC DEFAULT 0,
  lot_id              UUID DEFAULT gen_random_uuid(),
  expiry_date         DATE
);

-- RLS สำหรับ grn_headers
ALTER TABLE public.grn_headers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "grn_headers_all" ON public.grn_headers;
CREATE POLICY "grn_headers_all" ON public.grn_headers FOR ALL USING (true) WITH CHECK (true);

-- RLS สำหรับ grn_items
ALTER TABLE public.grn_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "grn_items_all" ON public.grn_items;
CREATE POLICY "grn_items_all" ON public.grn_items FOR ALL USING (true) WITH CHECK (true);

-- 9. แก้ check constraint ของ grn_headers_status_check
-- แก้ปัญหา: new row violates check constraint "grn_headers_status_check"
ALTER TABLE public.grn_headers DROP CONSTRAINT IF EXISTS grn_headers_status_check;
ALTER TABLE public.grn_headers ADD CONSTRAINT grn_headers_status_check
  CHECK (status IN ('draft', 'confirmed'));

-- 10. แก้ column ของ grn_items ให้ตรงกับโค้ด
-- ถ้าตารางถูกสร้างโดยใช้ชื่อ item_id ให้ rename เป็น inventory_item_id
DO $$
BEGIN
  -- ถ้ามี column ชื่อ item_id ให้ rename
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'grn_items'
      AND column_name  = 'item_id'
  ) THEN
    ALTER TABLE public.grn_items RENAME COLUMN item_id TO inventory_item_id;
  END IF;
  -- เพิ่ม column ถ้ายังไม่มีเลย
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'grn_items'
      AND column_name  = 'inventory_item_id'
  ) THEN
    ALTER TABLE public.grn_items ADD COLUMN inventory_item_id UUID REFERENCES public.inventory_items(id);
  END IF;
END $$;

-- 11. เพิ่มคอลัมน์ที่ขาดหายใน grn_items (ถ้าตารางถูกสร้างด้วย schema เดิม)
-- schema เดิมมี: quantity, unit, cost_per_unit, total_cost, item_name
-- schema ใหม่ต้องการ: qty_purchase, qty_stock, unit_cost, lot_id, expiry_date
ALTER TABLE public.grn_items ADD COLUMN IF NOT EXISTS qty_purchase   NUMERIC;
ALTER TABLE public.grn_items ADD COLUMN IF NOT EXISTS qty_stock      NUMERIC;
ALTER TABLE public.grn_items ADD COLUMN IF NOT EXISTS unit_cost      NUMERIC DEFAULT 0;
ALTER TABLE public.grn_items ADD COLUMN IF NOT EXISTS lot_id         UUID DEFAULT gen_random_uuid();
ALTER TABLE public.grn_items ADD COLUMN IF NOT EXISTS expiry_date    DATE;

-- คัดลอกข้อมูลเก่า → คอลัมน์ใหม่ (ถ้ามี column เดิมอยู่)
DO $$
BEGIN
  -- quantity → qty_purchase (ถ้า column quantity ยังอยู่)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'grn_items'
      AND column_name  = 'quantity'
  ) THEN
    UPDATE public.grn_items
    SET qty_purchase = quantity, qty_stock = quantity
    WHERE qty_purchase IS NULL OR qty_purchase = 0;
  END IF;

  -- cost_per_unit → unit_cost (ถ้า column cost_per_unit ยังอยู่)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'grn_items'
      AND column_name  = 'cost_per_unit'
  ) THEN
    UPDATE public.grn_items
    SET unit_cost = cost_per_unit
    WHERE unit_cost IS NULL OR unit_cost = 0;
  END IF;
END $$;

-- กำหนดค่า default ให้ qty_purchase, qty_stock ที่ยังเป็น NULL
UPDATE public.grn_items SET qty_purchase = 0 WHERE qty_purchase IS NULL;
UPDATE public.grn_items SET qty_stock = 0 WHERE qty_stock IS NULL;

-- ยกเลิกข้อจำกัด NOT NULL สำหรับคอลัมน์เก่า (ป้องกัน Error ตอนบันทึก)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'grn_items' AND column_name = 'quantity') THEN
    ALTER TABLE public.grn_items ALTER COLUMN quantity DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'grn_items' AND column_name = 'unit') THEN
    ALTER TABLE public.grn_items ALTER COLUMN unit DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'grn_items' AND column_name = 'cost_per_unit') THEN
    ALTER TABLE public.grn_items ALTER COLUMN cost_per_unit DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'grn_items' AND column_name = 'total_cost') THEN
    ALTER TABLE public.grn_items ALTER COLUMN total_cost DROP NOT NULL;
  END IF;
END $$;

-- Reload Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- 12. สร้างตารางสูตรอาหาร (BOM) สำหรับ M3A และ COGS Engine
CREATE TABLE IF NOT EXISTS public.menu_item_ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_item_id UUID NOT NULL, -- อ้างอิงตาราง menu_items ที่คุณมีอยู่
    inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE CASCADE,
    qty_required NUMERIC NOT NULL, -- จำนวนหน่วยสต๊อกที่ใช้ต่อ 1 เสิร์ฟ
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS สำหรับ menu_item_ingredients
ALTER TABLE public.menu_item_ingredients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "menu_item_ingredients_all" ON public.menu_item_ingredients;
CREATE POLICY "menu_item_ingredients_all" ON public.menu_item_ingredients FOR ALL USING (true) WITH CHECK (true);

-- แจ้งเตือน: อย่าลืมทำ Foreign Key ให้ menu_item_id ชี้ไปที่ตาราง menu ของระบบ (เช่น menu_items) ถ้ามี
-- ALTER TABLE public.menu_item_ingredients ADD CONSTRAINT fk_menu_item FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;
