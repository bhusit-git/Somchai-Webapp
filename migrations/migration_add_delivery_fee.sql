-- Migration: Add missing columns to transactions and transaction_items
-- This resolves schema cache errors during checkout for new features (promotions, delivery fee, sales channels)

-- 1. Transactions missing columns
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS gp_percent numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS gp_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS delivery_fee numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS sales_channel text DEFAULT 'dine_in',
ADD COLUMN IF NOT EXISTS applied_bill_promotion_id uuid REFERENCES public.promotions(id),
ADD COLUMN IF NOT EXISTS bill_discount_amount numeric DEFAULT 0;

-- 2. Transaction Items missing columns
ALTER TABLE public.transaction_items
ADD COLUMN IF NOT EXISTS applied_promotion_id uuid REFERENCES public.promotions(id),
ADD COLUMN IF NOT EXISTS original_price numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS final_price numeric DEFAULT 0;

-- =========================================================================
-- IMPORTANT NOTE FOR SUPABASE SCHEMA CACHE:
-- After running this script in the Supabase SQL Editor, you MUST reload the schema cache.
-- Otherwise, the frontend will still throw the "Could not find column" error.
-- 
-- How to reload the Schema Cache:
-- 1. Go to your Supabase Dashboard.
-- 2. Go to "Project Settings" (gear icon) -> "API".
-- 3. Scroll down and click the "Reload Schema Cache" button.
-- =========================================================================
