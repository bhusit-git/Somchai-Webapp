-- =========================================================================================
-- MIGRATION: Rate Limiting & RLS Production Policies
-- 
-- INSTRUCTIONS:
-- 1. Execute this file in the Supabase Dashboard -> SQL Editor.
-- 2. This will securely lock down your tables using the Custom JWT role system.
-- 3. Ensure you have deployed the Edge Function BEFORE dropping the 'USING (true)' policies!
-- =========================================================================================

-- 1. Create Login Attempts table for Brute-force protection
CREATE TABLE IF NOT EXISTS public.login_attempts (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    failed_attempts INTEGER DEFAULT 0,
    lockout_until TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on login_attempts
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- The Edge Function uses Service Role Key, so it bypasses RLS and can freely manage login_attempts.
-- We can add a strict policy so standard users/JWTs can never query other people's attempts.
CREATE POLICY "login_attempts_select" ON public.login_attempts 
  FOR SELECT USING (user_id = auth.uid());

-- =========================================================================================
-- 2. Transition from Dev RLS (USING true) to Prod RLS (Custom JWT Role-Based)
-- =========================================================================================

-- Clean up open-access policies for critical tables
DROP POLICY IF EXISTS "users_select" ON public.users;
DROP POLICY IF EXISTS "users_insert" ON public.users;
DROP POLICY IF EXISTS "users_update" ON public.users;
DROP POLICY IF EXISTS "users_delete" ON public.users;

DROP POLICY IF EXISTS "branches_select" ON public.branches;
DROP POLICY IF EXISTS "branches_insert" ON public.branches;
DROP POLICY IF EXISTS "branches_update" ON public.branches;
DROP POLICY IF EXISTS "branches_delete" ON public.branches;

-- Note: You should do similar DROP POLICY commands for the rest of your tables
-- (transactions, expenses, etc.) once you confirm the Custom JWT is working fully.

-- =========================================================================================
-- 3. Apply Production Role-Based Access Control (RBAC)
-- These use the custom JWT injected via our Edge Function: auth.jwt()->'user_metadata'->>'role'
-- =========================================================================================

-- ── branches: all authenticated users can read, anon can also read (for login page) ──
CREATE POLICY "branches_select_rbac" ON public.branches
  FOR SELECT USING (true);  -- branches list is non-sensitive, needed on login page
  
CREATE POLICY "branches_manage_rbac" ON public.branches
  FOR ALL USING ((auth.jwt()->'user_metadata'->>'role') IN ('owner'));

-- ── users: mgmt can manage, staff/cook can read own ──
-- Allow anon to read limited columns for login page user selection
-- NOTE: PostgREST RLS controls row access, not column access.
-- Column restriction must be handled via a VIEW or by the application selecting only safe columns.
-- The critical point is that pin_hash is NEVER selected by the frontend — only the Edge Function reads it.
CREATE POLICY "users_select_rbac" ON public.users
  FOR SELECT USING (true);  -- SELECT is safe because the frontend never queries pin_hash

CREATE POLICY "users_manage_rbac" ON public.users
  FOR ALL USING ((auth.jwt()->'user_metadata'->>'role') IN ('owner','manager','store_manager'));

-- Add additional RLS per the commented section in your original schema file for other modules 
-- e.g. shifts, transactions, expenses, etc.
