-- =====================================================================
-- MIGRATION: Daily Reconciliation (ตรวจทานยอดประจำวัน)
-- =====================================================================
-- สร้างตารางเพื่อเก็บข้อมูลการกระทบยอดรายวัน
-- รัน SQL นี้ใน Supabase SQL Editor
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.daily_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id),
    reconciliation_date DATE NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),

    -- JSONB: เก็บข้อมูลแต่ละหมวด
    -- cash_data: [{ shift_id, opener, closer, expected, staff_count, actual, variance, item_status:'confirmed'|'pending'|'held' }]
    cash_data JSONB DEFAULT '[]'::jsonb,
    -- digital_data: [{ channel, label, expected, actual, variance, item_status:'confirmed'|'pending'|'held' }]
    digital_data JSONB DEFAULT '[]'::jsonb,
    -- ar_data: [{ ar_payment_id, customer_name, expected, actual, variance, item_status:'confirmed'|'pending'|'held' }]
    ar_data JSONB DEFAULT '[]'::jsonb,

    completed_at TIMESTAMP WITH TIME ZONE,
    completed_by UUID REFERENCES public.users(id),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE (branch_id, reconciliation_date)
);

-- RLS: เปิดให้ทุกคนเข้าถึงได้ก่อน (Dev mode)
ALTER TABLE public.daily_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daily_reconciliations_select" ON public.daily_reconciliations FOR SELECT USING (true);
CREATE POLICY "daily_reconciliations_insert" ON public.daily_reconciliations FOR INSERT WITH CHECK (true);
CREATE POLICY "daily_reconciliations_update" ON public.daily_reconciliations FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "daily_reconciliations_delete" ON public.daily_reconciliations FOR DELETE USING (true);
