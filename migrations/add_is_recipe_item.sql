-- Migration: add is_recipe_item column to inventory_items
-- Run this in Supabase SQL Editor

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS is_recipe_item boolean NOT NULL DEFAULT false;

-- Optional: backfill existing items to false (already covered by DEFAULT)
-- UPDATE inventory_items SET is_recipe_item = false WHERE is_recipe_item IS NULL;

-- Add a comment for documentation
COMMENT ON COLUMN inventory_items.is_recipe_item IS
  'TRUE = วัตถุดิบหลักที่ตัดสต๊อกเป๊ะๆ และนำไปผูกสูตรอาหาร (BOM) ได้ | FALSE = ของจุกจิก/วัสดุสิ้นเปลือง (Consumable)';
