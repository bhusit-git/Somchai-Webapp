-- =========================================================================================
-- MIGRATION: Secure All Tables with Role-Based Access Control
-- 
-- INSTRUCTIONS:
-- 1. Execute this file in the Supabase Dashboard -> SQL Editor.
-- 2. This drops open access policies and locks down the database 
--    so only users validated by the Edge Function (with JWT roles) can access data.
-- =========================================================================================

DO $$
DECLARE
    t_name text;
    tables CURSOR FOR
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
          AND tablename NOT IN ('branches', 'users', 'login_attempts', 'combo_set_items');
BEGIN
    FOR t IN tables LOOP
        t_name := t.tablename;
        
        -- Enable RLS
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t_name);

        -- Drop existing permissive policies
        BEGIN
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t_name || '_select', t_name);
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t_name || '_insert', t_name);
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t_name || '_update', t_name);
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t_name || '_delete', t_name);
            
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t_name || '_select_rbac', t_name);
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t_name || '_manage_rbac', t_name);
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t_name || '_insert_rbac', t_name);
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t_name || '_update_rbac', t_name);
        EXCEPTION WHEN OTHERS THEN
            -- Ignore errors if policies don't exist
        END;

        -- Create secure RBAC policies
        EXECUTE format('
            CREATE POLICY %I ON public.%I
            FOR SELECT USING (
                (auth.jwt() -> ''user_metadata'' ->> ''role'') IS NOT NULL
            );
        ', t_name || '_select_rbac', t_name);

        EXECUTE format('
            CREATE POLICY %I ON public.%I
            FOR ALL USING (
                (auth.jwt() -> ''user_metadata'' ->> ''role'') IS NOT NULL
            );
        ', t_name || '_manage_rbac', t_name);
        
    END LOOP;
END $$;
