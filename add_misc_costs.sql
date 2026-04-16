-- เพิ่มคอลัมน์ misc_cost_type และ misc_cost_value ในตาราง products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS misc_cost_type VARCHAR(50) DEFAULT 'PERCENT';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS misc_cost_value DECIMAL(10,2) DEFAULT 0;

-- แจ้งให้ Supabase รีเฟรช schema cache
NOTIFY pgrst, 'reload schema';
