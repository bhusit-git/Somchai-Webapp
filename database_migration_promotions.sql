-- =================================================================================
-- Promotion Rule Engine Migration Script
-- =================================================================================

-- 1. Create `promotion_item_mappings` table for Polymorphic references
CREATE TABLE IF NOT EXISTS public.promotion_item_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promotion_id UUID NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
    reference_type VARCHAR(50) NOT NULL CHECK (reference_type IN ('product', 'category', 'entire_bill')),
    reference_id UUID, -- NULL when reference_type is 'entire_bill'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for faster queries in Rule Engine
CREATE INDEX IF NOT EXISTS idx_promotion_mappings_promo_id ON public.promotion_item_mappings(promotion_id);
CREATE INDEX IF NOT EXISTS idx_promotion_mappings_ref_id ON public.promotion_item_mappings(reference_id);

-- 2. Update `promotions` table schema
-- 2.1 Rename columns
ALTER TABLE public.promotions 
RENAME COLUMN happy_hour_start TO start_time;

ALTER TABLE public.promotions 
RENAME COLUMN happy_hour_end TO end_time;

-- 2.2 Drop deprecated columns
ALTER TABLE public.promotions 
DROP COLUMN IF EXISTS apply_to;

ALTER TABLE public.promotions 
DROP COLUMN IF EXISTS target_ids;

-- 3. Modify `transaction_items` to record line-item applied promotions
ALTER TABLE public.transaction_items 
ADD COLUMN IF NOT EXISTS applied_promotion_id UUID REFERENCES public.promotions(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS original_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS final_price DECIMAL(10,2);

-- Migrate existing total_price to final_price/original_price for backward compatibility if needed:
UPDATE public.transaction_items 
SET original_price = total_price, final_price = total_price 
WHERE original_price IS NULL;

-- 4. Modify `transactions` to record entire-bill applied promotions
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS applied_bill_promotion_id UUID REFERENCES public.promotions(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS bill_discount_amount DECIMAL(10,2) DEFAULT 0;

-- End of Script
