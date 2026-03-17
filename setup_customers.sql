-- =========================================================
--  Customers (Credit Customers)
--  Run this in your Supabase SQL Editor
-- =========================================================

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

-- Enable RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Policies for full access during development
CREATE POLICY "customers_select" ON public.customers FOR SELECT USING (true);
CREATE POLICY "customers_insert" ON public.customers FOR INSERT WITH CHECK (true);
CREATE POLICY "customers_update" ON public.customers FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "customers_delete" ON public.customers FOR DELETE USING (true);
