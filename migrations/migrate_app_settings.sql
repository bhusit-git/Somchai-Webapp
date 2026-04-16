-- Migration: Create app_settings table for global configurations
CREATE TABLE IF NOT EXISTS public.app_settings (
    id INT PRIMARY KEY DEFAULT 1,
    sales_channels JSONB DEFAULT '[{"id": "dine_in", "emoji": "🏪", "label": "หน้าร้าน", "isDefault": true}, {"id": "grab", "emoji": "🟢", "label": "Grab", "isDefault": true}, {"id": "lineman", "emoji": "🟡", "label": "LineMan", "isDefault": true}]'::jsonb,
    payment_methods JSONB DEFAULT '[{"icon": "Banknote", "label": "เงินสด (Cash)", "value": "cash", "enabled": true, "isDefault": true}, {"icon": "CreditCard", "label": "โอนเงิน (Transfer)", "value": "transfer", "enabled": true, "isDefault": true}]'::jsonb,
    system_config JSONB DEFAULT '{"vatPercent": 7, "gpGrabPercent": 30, "gpLinemanPercent": 30, "receiptFooter": "ขอบคุณที่ใช้บริการ สมชายหมูปิ้ง 🐷", "stockAlertDays": 2, "targetFcPercent": 35, "targetGpPercent": 60, "dailySalesTarget": 10000}'::jsonb,
    company_info JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert row id=1 if not exists
INSERT INTO public.app_settings (id)
SELECT 1
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE id = 1);

-- RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Allow read for authenticated users
CREATE POLICY "Allow read app_settings" ON public.app_settings
FOR SELECT USING (auth.role() = 'authenticated');

-- Allow update for authenticated users (we can restrict to OWNER later if needed)
CREATE POLICY "Allow update app_settings" ON public.app_settings
FOR UPDATE USING (auth.role() = 'authenticated');
