-- =========================================================================================
-- RESTAURANT CASH-SYNC ERP - SUPABASE SCHEMA (v2 — Complete)
-- =========================================================================================
-- Matches ALL frontend queries across Dashboard, POS, Expenses, Attendance,
-- Shifts, CashLedger, ARManagement, ProfitDashboard, StockReceiving, Inventory,
-- Settings, HRPayroll.
-- =========================================================================================

-- !!! WARNING !!!
-- This will DROP existing tables (and data) to ensure a clean Dev Database setup.
-- Remove these lines if you want to keep existing data.
DROP TABLE IF EXISTS public.grn_items CASCADE;
DROP TABLE IF EXISTS public.grn_headers CASCADE;
DROP TABLE IF EXISTS public.ar_payments CASCADE;
DROP TABLE IF EXISTS public.accounts_receivable CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;
DROP TABLE IF EXISTS public.safe_transactions CASCADE;
DROP TABLE IF EXISTS public.manager_safes CASCADE;
DROP TABLE IF EXISTS public.fixed_costs CASCADE;
DROP TABLE IF EXISTS public.cross_shift_ledgers CASCADE;
DROP TABLE IF EXISTS public.hr_salary_adjustments CASCADE;
DROP TABLE IF EXISTS public.hr_leave_requests CASCADE;
DROP TABLE IF EXISTS public.stock_transactions CASCADE;
DROP TABLE IF EXISTS public.inventory_items CASCADE;
DROP TABLE IF EXISTS public.transaction_items CASCADE;
DROP TABLE IF EXISTS public.transactions CASCADE;
DROP TABLE IF EXISTS public.employee_schedules CASCADE;
DROP TABLE IF EXISTS public.attendance CASCADE;
DROP TABLE IF EXISTS public.expenses CASCADE;
DROP TABLE IF EXISTS public.expense_categories CASCADE;
DROP TABLE IF EXISTS public.pos_order_items CASCADE;
DROP TABLE IF EXISTS public.pos_orders CASCADE;
DROP TABLE IF EXISTS public.shifts CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.menu_items CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.branches CASCADE;

-- =========================================================
-- 1. Branches
-- =========================================================
CREATE TABLE public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =========================================================
-- 2. Users (Employees)
-- =========================================================
CREATE TABLE public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id),
    name TEXT NOT NULL,
    full_name TEXT,  -- alias used by Attendance, Shifts, Expenses, StockReceiving
    pin_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'store_manager', 'cook', 'staff')),
    is_active BOOLEAN DEFAULT TRUE,
    employment_type TEXT DEFAULT 'monthly',
    pay_cycle TEXT DEFAULT 'monthly' CHECK (pay_cycle IN ('daily', 'bimonthly', 'monthly')),
    base_salary NUMERIC(10, 2) DEFAULT 0,
    daily_rate NUMERIC(10, 2) DEFAULT 0,
    daily_cash_advance NUMERIC(10, 2) DEFAULT 0,
    tax_id TEXT,
    sso_id TEXT,
    bank_account TEXT,
    bank_name TEXT,
    phone TEXT,
    id_card_number TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =========================================================
-- 3. Categories (POS / Menu)
-- =========================================================
CREATE TABLE public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =========================================================
-- 4. Menu Items (for Menu Engineering / COGS)
-- =========================================================
CREATE TABLE public.menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES public.categories(id),
    name TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    cost NUMERIC(10, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =========================================================
-- 5. Products (POS queries this table)
-- =========================================================
CREATE TABLE public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES public.categories(id),
    name TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    cost NUMERIC(10, 2) DEFAULT 0,
    is_available BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =========================================================
-- 6. Shifts (M2)
-- =========================================================
CREATE TABLE public.shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id),
    opened_by UUID REFERENCES public.users(id),
    closed_by UUID REFERENCES public.users(id),
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    opening_cash NUMERIC(10, 2) DEFAULT 0,
    closing_cash NUMERIC(10, 2) DEFAULT 0,
    expected_cash NUMERIC(10, 2) DEFAULT 0,
    cash_difference NUMERIC(10, 2) DEFAULT 0,
    discrepancy NUMERIC(10, 2) DEFAULT 0,
    shift_date TEXT,
    notes TEXT
);

-- =========================================================
-- 7. Transactions (POS orders — Dashboard & POS.jsx)
-- =========================================================
CREATE TABLE public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id),
    shift_id UUID REFERENCES public.shifts(id),
    created_by UUID REFERENCES public.users(id),
    order_number TEXT NOT NULL,
    subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0,
    discount NUMERIC(10, 2) DEFAULT 0,
    total NUMERIC(10, 2) NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL,
    cash_received NUMERIC(10, 2),
    change_amount NUMERIC(10, 2),
    status TEXT DEFAULT 'completed',
    -- Extended fields (promotions, delivery, channels, GP)
    gp_percent NUMERIC(5, 2) DEFAULT 0,
    gp_amount NUMERIC(10, 2) DEFAULT 0,
    delivery_fee NUMERIC(10, 2) DEFAULT 0,
    sales_channel TEXT DEFAULT 'dine_in',
    applied_bill_promotion_id UUID REFERENCES public.promotions(id),
    bill_discount_amount NUMERIC(10, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.transaction_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id),
    product_name TEXT,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL,
    total_price NUMERIC(10, 2) NOT NULL,
    -- Promotion & discount tracking
    applied_promotion_id UUID REFERENCES public.promotions(id),
    original_price NUMERIC(10, 2) DEFAULT 0,
    discount_amount NUMERIC(10, 2) DEFAULT 0,
    final_price NUMERIC(10, 2) DEFAULT 0
);

-- =========================================================
-- 8. Legacy POS Orders (keep for backward compat)
-- =========================================================
CREATE TABLE public.pos_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID REFERENCES public.shifts(id),
    user_id UUID REFERENCES public.users(id),
    branch_id UUID REFERENCES public.branches(id),
    total_amount NUMERIC(10, 2) NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'transfer', 'card', 'delivery')),
    status TEXT DEFAULT 'completed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.pos_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.pos_orders(id) ON DELETE CASCADE,
    menu_item_id UUID REFERENCES public.menu_items(id),
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL,
    total_price NUMERIC(10, 2) NOT NULL
);

-- =========================================================
-- 9A. Expense Categories
-- =========================================================
CREATE TABLE public.expense_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id),
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    is_admin_only BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =========================================================
-- 9. Expenses (M3B)
-- =========================================================
CREATE TABLE public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id),
    shift_id UUID REFERENCES public.shifts(id),
    created_by UUID REFERENCES public.users(id),
    approved_by UUID REFERENCES public.users(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'transfer')) DEFAULT 'cash',
    expense_type TEXT DEFAULT 'planned' CHECK (expense_type IN ('planned', 'emergency')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    notes TEXT,
    receipt_url TEXT,
    edit_reason TEXT,
    cancel_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =========================================================
-- 10. Attendance (M1)
-- =========================================================
CREATE TABLE public.attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id),
    branch_id UUID REFERENCES public.branches(id),
    type TEXT NOT NULL CHECK (type IN ('clock_in', 'clock_out')),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    note TEXT,
    shift_type TEXT,
    selfie_url TEXT,
    lat NUMERIC,
    lng NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =========================================================
-- 10B. Employee Schedules — กะตารางงาน (M1B)
-- =========================================================
CREATE TABLE public.employee_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id),
    branch_id UUID REFERENCES public.branches(id),
    schedule_date DATE NOT NULL,
    shift_type TEXT NOT NULL CHECK (shift_type IN ('morning', 'afternoon', 'evening', 'night', 'fullday')),
    notes TEXT,
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, schedule_date, shift_type)
);

-- =========================================================
-- 11. Cross-Shift Ledgers (M4 — CashLedger.jsx)
-- =========================================================
CREATE TABLE public.cross_shift_ledgers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id),
    type TEXT NOT NULL CHECK (type IN ('payable', 'receivable')),
    amount NUMERIC(10, 2) NOT NULL,
    reason TEXT,
    created_by UUID REFERENCES public.users(id),
    resolved BOOLEAN DEFAULT FALSE,
    resolved_by UUID REFERENCES public.users(id),
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =========================================================
-- 11B. Customers (Credit Customers)
-- =========================================================
CREATE TABLE public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id),
    name TEXT NOT NULL,
    company TEXT,
    phone TEXT,
    tax_id TEXT,
    ar_reminder_days INTEGER DEFAULT 30,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =========================================================
-- 12. Accounts Receivable (M5 — ARManagement.jsx)
-- =========================================================
CREATE TABLE public.accounts_receivable (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id),
    customer_name TEXT NOT NULL,
    customer_company TEXT,
    total_amount NUMERIC(10, 2) NOT NULL,
    paid_amount NUMERIC(10, 2) DEFAULT 0,
    due_date DATE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'overdue')),
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.ar_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ar_id UUID REFERENCES public.accounts_receivable(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL,
    payment_method TEXT DEFAULT 'transfer',
    received_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =========================================================
-- 13. Manager Safe & Profit Dashboard (M6)
-- =========================================================
CREATE TABLE public.manager_safes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id) UNIQUE,
    balance NUMERIC(12, 2) DEFAULT 0,
    last_cutoff_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.safe_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    safe_id UUID REFERENCES public.manager_safes(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('in', 'out', 'owner_withdraw')),
    amount NUMERIC(10, 2) NOT NULL,
    reason TEXT,
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.fixed_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id),
    period_month TEXT NOT NULL,  -- 'YYYY-MM'
    type TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    description TEXT,
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =========================================================
-- 14. Inventory & Stock (M7A & M7B)
-- =========================================================
CREATE TABLE public.inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    purchase_unit TEXT NOT NULL DEFAULT '',   -- หน่วยซื้อ เช่น ลัง, ถุง, แพ็ค
    stock_unit TEXT NOT NULL DEFAULT '',      -- หน่วยสต๊อก เช่น ไม้, ชิ้น, กรัม
    conversion_factor NUMERIC DEFAULT 1,      -- 1 purchase_unit = N stock_units
    yield_pct NUMERIC DEFAULT 100,            -- % ที่ใช้ได้จริงหลังตัดแต่ง
    reorder_point NUMERIC DEFAULT 0,          -- จุดสั่งซื้อ (แจ้งเตือน)
    par_level NUMERIC DEFAULT 0,              -- สต๊อกที่ควรมีติดร้าน
    lead_time_days INTEGER DEFAULT 1,         -- ระยะเวลารอของ (วัน)
    cost_per_stock_unit NUMERIC DEFAULT 0,    -- ต้นทุนต่อหน่วยสต๊อก
    current_stock NUMERIC DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    sku TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.stock_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID REFERENCES public.inventory_items(id),
    user_id UUID REFERENCES public.users(id),
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('in', 'out', 'adjustment')),
    quantity NUMERIC(10, 2) NOT NULL,
    cost_per_unit NUMERIC(10, 2),
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =========================================================
-- 15. GRN — Goods Received Notes (M7B — StockReceiving.jsx)
-- =========================================================
CREATE TABLE public.grn_headers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id),
    grn_number TEXT NOT NULL,
    supplier_name TEXT,
    received_by UUID REFERENCES public.users(id),
    total_amount NUMERIC(10, 2) DEFAULT 0,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'completed', 'cancelled')),
    notes TEXT,
    received_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.grn_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grn_id UUID REFERENCES public.grn_headers(id) ON DELETE CASCADE,
    inventory_item_id UUID REFERENCES public.inventory_items(id),
    qty_purchase NUMERIC(10, 2) NOT NULL,
    qty_stock NUMERIC(10, 2) NOT NULL,
    unit_cost NUMERIC(10, 2) DEFAULT 0,
    lot_id UUID DEFAULT gen_random_uuid(),
    expiry_date DATE,
    -- คอลัมน์เก่าเผื่อมีระบบที่ยังเรียกใช้ แล้วค่อยไปลบทีหลังด้วย all_updates.sql
    quantity NUMERIC(10, 2),
    unit TEXT,
    cost_per_unit NUMERIC(10, 2),
    total_cost NUMERIC(10, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =========================================================
-- 16. HR & Payroll (M13)
-- =========================================================
CREATE TABLE public.hr_leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id),
    leave_type TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days INTEGER NOT NULL,
    reason TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    approved_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.hr_salary_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id),
    adjust_type TEXT NOT NULL CHECK (adjust_type IN ('income', 'deduction')),
    amount NUMERIC(10, 2) NOT NULL,
    label TEXT NOT NULL,
    note TEXT,
    action_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.payroll_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'completed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.employee_payslips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id UUID REFERENCES public.payroll_cycles(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES public.users(id),
    base_salary_prorated NUMERIC(10, 2) DEFAULT 0,
    total_earnings NUMERIC(10, 2) DEFAULT 0,
    total_deductions NUMERIC(10, 2) DEFAULT 0,
    net_pay NUMERIC(10, 2) DEFAULT 0,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(cycle_id, employee_id)
);

CREATE TABLE public.payslip_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payslip_id UUID REFERENCES public.employee_payslips(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL CHECK (item_type IN ('earning', 'deduction')),
    item_code TEXT NOT NULL,
    description TEXT,
    amount NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- =========================================================================================
-- ENABLE ROW LEVEL SECURITY (Open for rapid prototyping)
-- =========================================================================================

-- Enable RLS on all tables
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cross_shift_ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts_receivable ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ar_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manager_safes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safe_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixed_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grn_headers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grn_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_salary_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payslip_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- =========================================================================================
-- RLS POLICIES — Full access for development (tighten in production)
-- =========================================================================================

-- Helper: create SELECT/INSERT/UPDATE/DELETE policies for a table
-- We do this for every table.

-- branches
CREATE POLICY "branches_select" ON public.branches FOR SELECT USING (true);
CREATE POLICY "branches_insert" ON public.branches FOR INSERT WITH CHECK (true);
CREATE POLICY "branches_update" ON public.branches FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "branches_delete" ON public.branches FOR DELETE USING (true);

-- users
CREATE POLICY "users_select" ON public.users FOR SELECT USING (true);
CREATE POLICY "users_insert" ON public.users FOR INSERT WITH CHECK (true);
CREATE POLICY "users_update" ON public.users FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "users_delete" ON public.users FOR DELETE USING (true);

-- categories
CREATE POLICY "categories_select" ON public.categories FOR SELECT USING (true);
CREATE POLICY "categories_insert" ON public.categories FOR INSERT WITH CHECK (true);
CREATE POLICY "categories_update" ON public.categories FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "categories_delete" ON public.categories FOR DELETE USING (true);

-- menu_items
CREATE POLICY "menu_items_select" ON public.menu_items FOR SELECT USING (true);
CREATE POLICY "menu_items_insert" ON public.menu_items FOR INSERT WITH CHECK (true);
CREATE POLICY "menu_items_update" ON public.menu_items FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "menu_items_delete" ON public.menu_items FOR DELETE USING (true);

-- products
CREATE POLICY "products_select" ON public.products FOR SELECT USING (true);
CREATE POLICY "products_insert" ON public.products FOR INSERT WITH CHECK (true);
CREATE POLICY "products_update" ON public.products FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "products_delete" ON public.products FOR DELETE USING (true);

-- shifts
CREATE POLICY "shifts_select" ON public.shifts FOR SELECT USING (true);
CREATE POLICY "shifts_insert" ON public.shifts FOR INSERT WITH CHECK (true);
CREATE POLICY "shifts_update" ON public.shifts FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "shifts_delete" ON public.shifts FOR DELETE USING (true);

-- transactions
CREATE POLICY "transactions_select" ON public.transactions FOR SELECT USING (true);
CREATE POLICY "transactions_insert" ON public.transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "transactions_update" ON public.transactions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "transactions_delete" ON public.transactions FOR DELETE USING (true);

-- transaction_items
CREATE POLICY "transaction_items_select" ON public.transaction_items FOR SELECT USING (true);
CREATE POLICY "transaction_items_insert" ON public.transaction_items FOR INSERT WITH CHECK (true);
CREATE POLICY "transaction_items_update" ON public.transaction_items FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "transaction_items_delete" ON public.transaction_items FOR DELETE USING (true);

-- pos_orders
CREATE POLICY "pos_orders_select" ON public.pos_orders FOR SELECT USING (true);
CREATE POLICY "pos_orders_insert" ON public.pos_orders FOR INSERT WITH CHECK (true);
CREATE POLICY "pos_orders_update" ON public.pos_orders FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "pos_orders_delete" ON public.pos_orders FOR DELETE USING (true);

-- pos_order_items
CREATE POLICY "pos_order_items_select" ON public.pos_order_items FOR SELECT USING (true);
CREATE POLICY "pos_order_items_insert" ON public.pos_order_items FOR INSERT WITH CHECK (true);
CREATE POLICY "pos_order_items_update" ON public.pos_order_items FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "pos_order_items_delete" ON public.pos_order_items FOR DELETE USING (true);

-- expense_categories
CREATE POLICY "expense_categories_select" ON public.expense_categories FOR SELECT USING (true);
CREATE POLICY "expense_categories_insert" ON public.expense_categories FOR INSERT WITH CHECK (true);
CREATE POLICY "expense_categories_update" ON public.expense_categories FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "expense_categories_delete" ON public.expense_categories FOR DELETE USING (true);

-- expenses
CREATE POLICY "expenses_select" ON public.expenses FOR SELECT USING (true);
CREATE POLICY "expenses_insert" ON public.expenses FOR INSERT WITH CHECK (true);
CREATE POLICY "expenses_update" ON public.expenses FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "expenses_delete" ON public.expenses FOR DELETE USING (true);

-- attendance
CREATE POLICY "attendance_select" ON public.attendance FOR SELECT USING (true);
CREATE POLICY "attendance_insert" ON public.attendance FOR INSERT WITH CHECK (true);
CREATE POLICY "attendance_update" ON public.attendance FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "attendance_delete" ON public.attendance FOR DELETE USING (true);

-- cross_shift_ledgers
CREATE POLICY "cross_shift_ledgers_select" ON public.cross_shift_ledgers FOR SELECT USING (true);
CREATE POLICY "cross_shift_ledgers_insert" ON public.cross_shift_ledgers FOR INSERT WITH CHECK (true);
CREATE POLICY "cross_shift_ledgers_update" ON public.cross_shift_ledgers FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "cross_shift_ledgers_delete" ON public.cross_shift_ledgers FOR DELETE USING (true);

-- accounts_receivable
CREATE POLICY "accounts_receivable_select" ON public.accounts_receivable FOR SELECT USING (true);
CREATE POLICY "accounts_receivable_insert" ON public.accounts_receivable FOR INSERT WITH CHECK (true);
CREATE POLICY "accounts_receivable_update" ON public.accounts_receivable FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "accounts_receivable_delete" ON public.accounts_receivable FOR DELETE USING (true);

-- ar_payments
CREATE POLICY "ar_payments_select" ON public.ar_payments FOR SELECT USING (true);
CREATE POLICY "ar_payments_insert" ON public.ar_payments FOR INSERT WITH CHECK (true);
CREATE POLICY "ar_payments_update" ON public.ar_payments FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "ar_payments_delete" ON public.ar_payments FOR DELETE USING (true);

-- manager_safes
CREATE POLICY "manager_safes_select" ON public.manager_safes FOR SELECT USING (true);
CREATE POLICY "manager_safes_insert" ON public.manager_safes FOR INSERT WITH CHECK (true);
CREATE POLICY "manager_safes_update" ON public.manager_safes FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "manager_safes_delete" ON public.manager_safes FOR DELETE USING (true);

-- safe_transactions
CREATE POLICY "safe_transactions_select" ON public.safe_transactions FOR SELECT USING (true);
CREATE POLICY "safe_transactions_insert" ON public.safe_transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "safe_transactions_update" ON public.safe_transactions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "safe_transactions_delete" ON public.safe_transactions FOR DELETE USING (true);

-- fixed_costs
CREATE POLICY "fixed_costs_select" ON public.fixed_costs FOR SELECT USING (true);
CREATE POLICY "fixed_costs_insert" ON public.fixed_costs FOR INSERT WITH CHECK (true);
CREATE POLICY "fixed_costs_update" ON public.fixed_costs FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "fixed_costs_delete" ON public.fixed_costs FOR DELETE USING (true);

-- inventory_items
CREATE POLICY "inventory_items_select" ON public.inventory_items FOR SELECT USING (true);
CREATE POLICY "inventory_items_insert" ON public.inventory_items FOR INSERT WITH CHECK (true);
CREATE POLICY "inventory_items_update" ON public.inventory_items FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "inventory_items_delete" ON public.inventory_items FOR DELETE USING (true);

-- stock_transactions
CREATE POLICY "stock_transactions_select" ON public.stock_transactions FOR SELECT USING (true);
CREATE POLICY "stock_transactions_insert" ON public.stock_transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "stock_transactions_update" ON public.stock_transactions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "stock_transactions_delete" ON public.stock_transactions FOR DELETE USING (true);

-- grn_headers
CREATE POLICY "grn_headers_select" ON public.grn_headers FOR SELECT USING (true);
CREATE POLICY "grn_headers_insert" ON public.grn_headers FOR INSERT WITH CHECK (true);
CREATE POLICY "grn_headers_update" ON public.grn_headers FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "grn_headers_delete" ON public.grn_headers FOR DELETE USING (true);

-- grn_items
CREATE POLICY "grn_items_select" ON public.grn_items FOR SELECT USING (true);
CREATE POLICY "grn_items_insert" ON public.grn_items FOR INSERT WITH CHECK (true);
CREATE POLICY "grn_items_update" ON public.grn_items FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "grn_items_delete" ON public.grn_items FOR DELETE USING (true);

-- employee_schedules
CREATE POLICY "employee_schedules_select" ON public.employee_schedules FOR SELECT USING (true);
CREATE POLICY "employee_schedules_insert" ON public.employee_schedules FOR INSERT WITH CHECK (true);
CREATE POLICY "employee_schedules_update" ON public.employee_schedules FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "employee_schedules_delete" ON public.employee_schedules FOR DELETE USING (true);

-- hr_leave_requests
CREATE POLICY "hr_leave_requests_select" ON public.hr_leave_requests FOR SELECT USING (true);
CREATE POLICY "hr_leave_requests_insert" ON public.hr_leave_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "hr_leave_requests_update" ON public.hr_leave_requests FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "hr_leave_requests_delete" ON public.hr_leave_requests FOR DELETE USING (true);

-- hr_salary_adjustments
CREATE POLICY "hr_salary_adjustments_select" ON public.hr_salary_adjustments FOR SELECT USING (true);
CREATE POLICY "hr_salary_adjustments_insert" ON public.hr_salary_adjustments FOR INSERT WITH CHECK (true);
CREATE POLICY "hr_salary_adjustments_update" ON public.hr_salary_adjustments FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "hr_salary_adjustments_delete" ON public.hr_salary_adjustments FOR DELETE USING (true);

-- payroll_cycles
CREATE POLICY "payroll_cycles_select" ON public.payroll_cycles FOR SELECT USING (true);
CREATE POLICY "payroll_cycles_insert" ON public.payroll_cycles FOR INSERT WITH CHECK (true);
CREATE POLICY "payroll_cycles_update" ON public.payroll_cycles FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "payroll_cycles_delete" ON public.payroll_cycles FOR DELETE USING (true);

-- employee_payslips
CREATE POLICY "employee_payslips_select" ON public.employee_payslips FOR SELECT USING (true);
CREATE POLICY "employee_payslips_insert" ON public.employee_payslips FOR INSERT WITH CHECK (true);
CREATE POLICY "employee_payslips_update" ON public.employee_payslips FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "employee_payslips_delete" ON public.employee_payslips FOR DELETE USING (true);

-- payslip_items
CREATE POLICY "payslip_items_select" ON public.payslip_items FOR SELECT USING (true);
CREATE POLICY "payslip_items_insert" ON public.payslip_items FOR INSERT WITH CHECK (true);
CREATE POLICY "payslip_items_update" ON public.payslip_items FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "payslip_items_delete" ON public.payslip_items FOR DELETE USING (true);

-- customers
CREATE POLICY "customers_select" ON public.customers FOR SELECT USING (true);
CREATE POLICY "customers_insert" ON public.customers FOR INSERT WITH CHECK (true);
CREATE POLICY "customers_update" ON public.customers FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "customers_delete" ON public.customers FOR DELETE USING (true);


-- =========================================================================================
-- TRIGGER: Auto-populate full_name from name on users table
-- =========================================================================================
CREATE OR REPLACE FUNCTION public.sync_full_name()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.full_name IS NULL THEN
        NEW.full_name := NEW.name;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sync_full_name
    BEFORE INSERT OR UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_full_name();

-- =========================================================================================
-- STORAGE: Selfie bucket for Attendance photos (Camera Integration — M1)
-- Run this ONCE in Supabase Dashboard → SQL Editor
-- =========================================================================================

-- Create the selfies bucket (public read so selfie_url links work in the table)
INSERT INTO storage.buckets (id, name, public)
VALUES ('selfies', 'selfies', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to upload selfies (tighten with auth in production)
CREATE POLICY "selfies_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'selfies');

-- Allow public read of selfie images
CREATE POLICY "selfies_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'selfies');


-- =========================================================================================
-- PRODUCTION RLS POLICIES — Role-Based (activate after migrating to Supabase Auth)
-- =========================================================================================
-- ⚠ Prerequisites:
--   1. Migrate login from PIN-based → supabase.auth.signInWithPassword()
--   2. Store role in auth.users.raw_user_meta_data.role
--   3. DROP all existing "USING (true)" policies above before applying these
--
-- Helper expression:  (auth.jwt()->'user_metadata'->>'role')
-- =========================================================================================

/*
-- ── branches: all authenticated users can read ──
CREATE POLICY "branches_select_rbac" ON public.branches
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "branches_manage_rbac" ON public.branches
  FOR ALL USING ((auth.jwt()->'user_metadata'->>'role') IN ('owner'));

-- ── users: mgmt can manage, staff/cook can read own ──
CREATE POLICY "users_select_rbac" ON public.users
  FOR SELECT USING (
    (auth.jwt()->'user_metadata'->>'role') IN ('owner','manager','store_manager')
    OR id = auth.uid()
  );
CREATE POLICY "users_manage_rbac" ON public.users
  FOR ALL USING ((auth.jwt()->'user_metadata'->>'role') IN ('owner','manager','store_manager'));

-- ── shifts: mgmt only ──
CREATE POLICY "shifts_select_rbac" ON public.shifts
  FOR SELECT USING ((auth.jwt()->'user_metadata'->>'role') IN ('owner','manager','store_manager'));
CREATE POLICY "shifts_manage_rbac" ON public.shifts
  FOR ALL USING ((auth.jwt()->'user_metadata'->>'role') IN ('owner','store_manager'));

-- ── transactions: staff sees own, mgmt sees all ──
CREATE POLICY "transactions_select_rbac" ON public.transactions
  FOR SELECT USING (
    (auth.jwt()->'user_metadata'->>'role') IN ('owner','manager','store_manager')
    OR created_by = auth.uid()
  );
CREATE POLICY "transactions_insert_rbac" ON public.transactions
  FOR INSERT WITH CHECK (
    (auth.jwt()->'user_metadata'->>'role') IN ('owner','manager','store_manager','staff')
  );

-- ── expenses: staff creates own, mgmt manages ──
CREATE POLICY "expenses_select_rbac" ON public.expenses
  FOR SELECT USING (
    (auth.jwt()->'user_metadata'->>'role') IN ('owner','manager','store_manager')
    OR created_by = auth.uid()
  );
CREATE POLICY "expenses_insert_rbac" ON public.expenses
  FOR INSERT WITH CHECK (
    (auth.jwt()->'user_metadata'->>'role') IN ('owner','manager','store_manager','staff')
  );
CREATE POLICY "expenses_update_rbac" ON public.expenses
  FOR UPDATE USING ((auth.jwt()->'user_metadata'->>'role') IN ('owner','manager','store_manager'));

-- ── attendance: staff/cook sees own, mgmt sees all ──
CREATE POLICY "attendance_select_rbac" ON public.attendance
  FOR SELECT USING (
    (auth.jwt()->'user_metadata'->>'role') IN ('owner','manager','store_manager')
    OR user_id = auth.uid()
  );
CREATE POLICY "attendance_insert_rbac" ON public.attendance
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ── manager_safes / safe_transactions: mgmt only ──
CREATE POLICY "manager_safes_select_rbac" ON public.manager_safes
  FOR SELECT USING ((auth.jwt()->'user_metadata'->>'role') IN ('owner','manager','store_manager'));
CREATE POLICY "safe_transactions_select_rbac" ON public.safe_transactions
  FOR SELECT USING ((auth.jwt()->'user_metadata'->>'role') IN ('owner','manager','store_manager'));

-- ── inventory_items: cook + mgmt ──
CREATE POLICY "inventory_items_select_rbac" ON public.inventory_items
  FOR SELECT USING ((auth.jwt()->'user_metadata'->>'role') IN ('owner','manager','store_manager','cook'));
CREATE POLICY "inventory_items_manage_rbac" ON public.inventory_items
  FOR ALL USING ((auth.jwt()->'user_metadata'->>'role') IN ('owner','manager','store_manager'));

-- ── hr_leave_requests: own + mgmt ──
CREATE POLICY "hr_leave_requests_select_rbac" ON public.hr_leave_requests
  FOR SELECT USING (
    (auth.jwt()->'user_metadata'->>'role') IN ('owner','manager','store_manager')
    OR user_id = auth.uid()
  );
CREATE POLICY "hr_leave_requests_insert_rbac" ON public.hr_leave_requests
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ── hr_salary_adjustments: own + mgmt ──
CREATE POLICY "hr_salary_adjustments_select_rbac" ON public.hr_salary_adjustments
  FOR SELECT USING (
    (auth.jwt()->'user_metadata'->>'role') IN ('owner','manager','store_manager')
    OR user_id = auth.uid()
  );
CREATE POLICY "hr_salary_adjustments_manage_rbac" ON public.hr_salary_adjustments
  FOR ALL USING ((auth.jwt()->'user_metadata'->>'role') IN ('owner','manager','store_manager'));

-- ── payroll_cycles: mgmt only ──
CREATE POLICY "payroll_cycles_select_rbac" ON public.payroll_cycles
  FOR SELECT USING ((auth.jwt()->'user_metadata'->>'role') IN ('owner','manager','store_manager'));
CREATE POLICY "payroll_cycles_manage_rbac" ON public.payroll_cycles
  FOR ALL USING ((auth.jwt()->'user_metadata'->>'role') IN ('owner','manager'));

-- ── employee_payslips: own + mgmt ──
CREATE POLICY "employee_payslips_select_rbac" ON public.employee_payslips
  FOR SELECT USING (
    (auth.jwt()->'user_metadata'->>'role') IN ('owner','manager','store_manager')
    OR employee_id = auth.uid()
  );
CREATE POLICY "employee_payslips_manage_rbac" ON public.employee_payslips
  FOR ALL USING ((auth.jwt()->'user_metadata'->>'role') IN ('owner','manager','store_manager'));

-- ── payslip_items: own + mgmt (via employee_payslips relation check) ──
CREATE POLICY "payslip_items_select_rbac" ON public.payslip_items
  FOR SELECT USING (
    (auth.jwt()->'user_metadata'->>'role') IN ('owner','manager','store_manager')
    OR payslip_id IN (SELECT id FROM public.employee_payslips WHERE employee_id = auth.uid())
  );
CREATE POLICY "payslip_items_manage_rbac" ON public.payslip_items
  FOR ALL USING ((auth.jwt()->'user_metadata'->>'role') IN ('owner','manager','store_manager'));
*/


-- =========================================================================================
-- MIGRATION: ถ้าตาราง inventory_items มีอยู่แล้ว (ไม่ต้องการ DROP ข้อมูลเดิม)
-- คัดลอก block นี้ไปรันใน Supabase SQL Editor แยกต่างหาก
-- =========================================================================================
/*
ALTER TABLE public.inventory_items
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS purchase_unit TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS stock_unit TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS conversion_factor NUMERIC DEFAULT 1,
    ADD COLUMN IF NOT EXISTS yield_pct NUMERIC DEFAULT 100,
    ADD COLUMN IF NOT EXISTS reorder_point NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS par_level NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS lead_time_days INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS cost_per_stock_unit NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sku TEXT;
*/
