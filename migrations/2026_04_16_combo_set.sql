-- 1. Update products table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_type TEXT DEFAULT 'STANDARD' CHECK (product_type IN ('STANDARD', 'COMBO'));

-- 2. Create product_combo_items table
CREATE TABLE IF NOT EXISTS public.product_combo_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    combo_product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    item_product_id UUID REFERENCES public.products(id),
    quantity NUMERIC NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable RLS
ALTER TABLE public.product_combo_items ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies
DO $$
BEGIN
    DROP POLICY IF EXISTS "product_combo_items_select" ON public.product_combo_items;
    DROP POLICY IF EXISTS "product_combo_items_insert" ON public.product_combo_items;
    DROP POLICY IF EXISTS "product_combo_items_update" ON public.product_combo_items;
    DROP POLICY IF EXISTS "product_combo_items_delete" ON public.product_combo_items;
END $$;

CREATE POLICY "product_combo_items_select" ON public.product_combo_items FOR SELECT USING (true);
CREATE POLICY "product_combo_items_insert" ON public.product_combo_items FOR INSERT WITH CHECK (true);
CREATE POLICY "product_combo_items_update" ON public.product_combo_items FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "product_combo_items_delete" ON public.product_combo_items FOR DELETE USING (true);

-- 5. Create Supabase RPC for Atomic Stock Depletion
CREATE OR REPLACE FUNCTION public.process_transaction_stock_depletion(p_transaction_id UUID)
RETURNS void AS $$
DECLARE
    r_item RECORD;
    r_combo_item RECORD;
    r_ingredient RECORD;
    v_total_depletion NUMERIC;
    v_product_type TEXT;
BEGIN
    -- Loop through each item in the transaction
    FOR r_item IN 
        SELECT product_id, quantity 
        FROM public.transaction_items 
        WHERE transaction_id = p_transaction_id
    LOOP
        -- Get product type
        SELECT product_type INTO v_product_type FROM public.products WHERE id = r_item.product_id;

        IF v_product_type = 'STANDARD' THEN
            -- Deduct stock for STANDARD product
            FOR r_ingredient IN 
                SELECT inventory_item_id, qty_required 
                FROM public.menu_item_ingredients 
                WHERE menu_item_id = r_item.product_id
            LOOP
                v_total_depletion := r_ingredient.qty_required * r_item.quantity;
                
                -- Update inventory
                UPDATE public.inventory_items 
                SET current_stock = GREATEST(0, current_stock - v_total_depletion)
                WHERE id = r_ingredient.inventory_item_id;

                -- Record stock transaction
                INSERT INTO public.stock_transactions (item_id, transaction_type, quantity, note)
                VALUES (r_ingredient.inventory_item_id, 'out', v_total_depletion, 'Sale: Order ' || p_transaction_id);
            END LOOP;

        ELSIF v_product_type = 'COMBO' THEN
            -- Resolve COMBO items (1-level deep)
            FOR r_combo_item IN 
                SELECT item_product_id, quantity as combo_qty 
                FROM public.product_combo_items 
                WHERE combo_product_id = r_item.product_id
            LOOP
                -- For each child item, get its ingredients
                FOR r_ingredient IN 
                    SELECT inventory_item_id, qty_required 
                    FROM public.menu_item_ingredients 
                    WHERE menu_item_id = r_combo_item.item_product_id
                LOOP
                    v_total_depletion := r_ingredient.qty_required * r_combo_item.combo_qty * r_item.quantity;
                    
                    -- Update inventory
                    UPDATE public.inventory_items 
                    SET current_stock = GREATEST(0, current_stock - v_total_depletion)
                    WHERE id = r_ingredient.inventory_item_id;

                    -- Record stock transaction
                    INSERT INTO public.stock_transactions (item_id, transaction_type, quantity, note)
                    VALUES (r_ingredient.inventory_item_id, 'out', v_total_depletion, 'Sale (Combo): Order ' || p_transaction_id);
                END LOOP;
            END LOOP;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
