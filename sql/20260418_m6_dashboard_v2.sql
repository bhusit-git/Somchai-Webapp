-- =========================================================================================
-- M6 SAFE & PROFIT DASHBOARD OVERHAUL (v2)
-- Implementation of Resolutions 1, 2, 3, 4
-- =========================================================================================

-- 1. Snapshot COGS at time of sale (Resolution 4)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transaction_items' AND column_name='cogs_at_time_of_sale') THEN
        ALTER TABLE public.transaction_items ADD COLUMN cogs_at_time_of_sale NUMERIC(10, 2) DEFAULT 0;
    END IF;
END $$;

-- 2. Create daily_reconciliations (Resolution 1 & 2)
CREATE TABLE IF NOT EXISTS public.daily_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
    reconciliation_date DATE NOT NULL,
    opening_balance NUMERIC(12, 2) DEFAULT 0,
    cash_sales NUMERIC(12, 2) DEFAULT 0,
    cash_expenses NUMERIC(12, 2) DEFAULT 0,
    cash_deposits NUMERIC(12, 2) DEFAULT 0,
    expected_balance NUMERIC(12, 2) DEFAULT 0,
    actual_balance NUMERIC(12, 2) DEFAULT 0,
    discrepancy_amount NUMERIC(12, 2) DEFAULT 0,
    status TEXT CHECK (status IN ('matched', 'short', 'over')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(branch_id, reconciliation_date)
);

-- 3. Create profit_loss_summaries (Resolution 3)
CREATE TABLE IF NOT EXISTS public.profit_loss_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
    summary_date DATE NOT NULL,
    total_revenue NUMERIC(12, 2) DEFAULT 0,
    total_cogs NUMERIC(12, 2) DEFAULT 0,
    total_payroll NUMERIC(12, 2) DEFAULT 0, -- snapshot from salary_adjustments/attendance if any
    total_expenses NUMERIC(12, 2) DEFAULT 0,
    net_profit NUMERIC(12, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(branch_id, summary_date)
);

-- RLS for new tables
ALTER TABLE public.daily_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profit_loss_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_reconciliations_select" ON public.daily_reconciliations FOR SELECT USING (true);
CREATE POLICY "daily_reconciliations_insert" ON public.daily_reconciliations FOR INSERT WITH CHECK (true);
CREATE POLICY "daily_reconciliations_update" ON public.daily_reconciliations FOR UPDATE USING (true);

CREATE POLICY "profit_loss_summaries_select" ON public.profit_loss_summaries FOR SELECT USING (true);
CREATE POLICY "profit_loss_summaries_insert" ON public.profit_loss_summaries FOR INSERT WITH CHECK (true);

-- 4. P&L Snapshot Logic (Resolution 3)
CREATE OR REPLACE FUNCTION public.generate_daily_pnl_snapshot(p_branch_id UUID, p_date DATE)
RETURNS void AS $$
DECLARE
    v_revenue NUMERIC(12, 2);
    v_cogs NUMERIC(12, 2);
    v_expenses NUMERIC(12, 2);
BEGIN
    -- 1. Calculate Revenue (Excluding staff_meal)
    SELECT COALESCE(SUM(total), 0) INTO v_revenue
    FROM public.transactions
    WHERE branch_id = p_branch_id
      AND created_at::date = p_date
      AND status = 'completed'
      AND payment_method != 'staff_meal';

    -- 2. Calculate COGS (Frozen values)
    -- Includes both normal transactions and staff meal costs (as they are lost inventory)
    SELECT COALESCE(SUM(cogs_at_time_of_sale * quantity), 0) INTO v_cogs
    FROM public.transaction_items ti
    JOIN public.transactions t ON ti.transaction_id = t.id
    WHERE t.branch_id = p_branch_id
      AND t.created_at::date = p_date
      AND t.status = 'completed';

    -- 3. Calculate Expenses (Includes fixed and other expenses)
    SELECT COALESCE(SUM(amount), 0) INTO v_expenses
    FROM public.expenses
    WHERE branch_id = p_branch_id
      AND created_at::date = p_date
      AND status = 'approved';

    -- 4. Upsert Summary
    INSERT INTO public.profit_loss_summaries (
        branch_id, summary_date, total_revenue, total_cogs, total_expenses, net_profit
    ) VALUES (
        p_branch_id, p_date, v_revenue, v_cogs, v_expenses, (v_revenue - v_cogs - v_expenses)
    )
    ON CONFLICT (branch_id, summary_date) DO UPDATE SET
        total_revenue = EXCLUDED.total_revenue,
        total_cogs = EXCLUDED.total_cogs,
        total_expenses = EXCLUDED.total_expenses,
        net_profit = EXCLUDED.net_profit,
        created_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- 5. Cron Job Setup (Requires pg_cron extension enabled in Supabase)
-- NOTE: User MUST run 'CREATE EXTENSION IF NOT EXISTS pg_cron;' manually in Supabase SQL editor.

/*
-- Example: Snapshot all branches for yesterday at 3 AM
SELECT cron.schedule(
    'daily-pnl-snapshot',
    '0 3 * * *',
    $$
    SELECT public.generate_daily_pnl_snapshot(id, (CURRENT_DATE - INTERVAL '1 day')::date)
    FROM public.branches;
    $$
);
*/
