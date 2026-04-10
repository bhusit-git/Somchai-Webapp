-- Add stock_count_data column to shifts table to support blind close physical counting

ALTER TABLE shifts
ADD COLUMN IF NOT EXISTS stock_count_data JSONB;
