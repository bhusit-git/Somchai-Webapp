-- =========================================================================================
-- MIGRATION: menu_prices table for per-channel pricing + availability
-- Run this in Supabase Dashboard → SQL Editor
-- =========================================================================================

CREATE TABLE IF NOT EXISTS public.menu_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    channel TEXT NOT NULL,
    price NUMERIC(10, 2),
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(menu_id, channel)
);

ALTER TABLE public.menu_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "menu_prices_select" ON public.menu_prices FOR SELECT USING (true);
CREATE POLICY "menu_prices_insert" ON public.menu_prices FOR INSERT WITH CHECK (true);
CREATE POLICY "menu_prices_update" ON public.menu_prices FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "menu_prices_delete" ON public.menu_prices FOR DELETE USING (true);
