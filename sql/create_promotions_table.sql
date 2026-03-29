-- ============================================
-- Promotions Table for Somchai App
-- ============================================

CREATE TABLE IF NOT EXISTS promotions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  
  -- Discount configuration
  discount_type TEXT NOT NULL CHECK (discount_type IN ('PERCENTAGE', 'FIXED_AMOUNT', 'FIXED_PRICE')),
  discount_value NUMERIC NOT NULL DEFAULT 0,
  
  -- Apply target
  apply_to TEXT NOT NULL CHECK (apply_to IN ('ENTIRE_BILL', 'SPECIFIC_ITEM', 'CATEGORY')),
  target_ids JSONB DEFAULT NULL, -- array of product IDs or category IDs
  
  -- Time conditions
  start_date DATE,
  end_date DATE,
  happy_hour_start TIME,
  happy_hour_end TIME,
  
  -- Channel conditions
  applicable_channels JSONB DEFAULT '[]'::JSONB, -- e.g. ['grab', 'lineman']
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all authenticated users to read promotions
CREATE POLICY "Allow read promotions" ON promotions
  FOR SELECT USING (true);

-- Policy: Allow insert/update/delete for authenticated users
CREATE POLICY "Allow manage promotions" ON promotions
  FOR ALL USING (true);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions (is_active, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_promotions_branch ON promotions (branch_id);
