-- Run this script in the Supabase SQL Editor
ALTER TABLE accounts_receivable ADD COLUMN transaction_id UUID REFERENCES transactions(id);
