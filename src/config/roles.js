// =============================================================================
// Role Permission Matrix — Single Source of Truth
// =============================================================================
// Roles: owner, manager, store_manager, cook, staff
//
// Permission levels per route (from the matrix):
//   F = full access       R = read-only       S = self/shift only       N = no access
//
// For the React frontend we only care about "can access the page?" (F, R, or S = yes).
// Fine-grained read-only / self-only logic lives inside each page component.
// =============================================================================

/** All five roles in hierarchy order (highest → lowest) */
export const ALL_ROLES = ['owner', 'manager', 'store_manager', 'cook', 'staff'];

/** Role groups used across routes & sidebar */
const everyone    = ['owner', 'manager', 'store_manager', 'cook', 'staff'];
const mgmt        = ['owner', 'manager', 'store_manager'];
const upperMgmt   = ['owner', 'manager'];

// ---------------------------------------------------------------------------
// Route → Allowed Roles  (matches the Permission Matrix exactly)
// ---------------------------------------------------------------------------
export const ROUTE_PERMISSIONS = {
  // --- Core Operations ---
  '/':                everyone,                                       // Dashboard  (S / S / F / F / F)
  '/attendance':      ['owner', 'manager', 'store_manager', 'staff'], // Attendance (S / N / F / F / F)
  '/shifts':          mgmt,                                           // Shifts     (N / N / F / R / F)
  '/pos':             ['owner', 'manager', 'store_manager', 'staff'], // POS        (F / N / F / R / F)
  '/expenses':        ['owner', 'manager', 'store_manager', 'staff'], // Expenses   (S / N / F / R / F)

  // --- Cash & Finance ---
  '/cash-ledger':     mgmt,                                           // Cash Ledger      (N / N / F / F / F)
  '/ar-management':   mgmt,                                           // AR Management    (N / N / F / F / F)
  '/profit-dashboard':mgmt,                                           // Profit Dashboard (N / N / R / F / F)

  // --- Inventory ---
  '/inventory':       ['owner', 'manager', 'store_manager', 'cook'],  // Inventory        (N / F / F / F / F)
  '/purchase-orders': mgmt,                                           // Purchase Orders  (Owner, Area Manager)
  '/stock-receiving': everyone,                                       // Stock Receiving   (staff needs for Blind Receiving)
  '/bom':             ['owner', 'manager', 'store_manager', 'cook'],  // Recipe Management (BOM) (N / F / F / F / F)

  // --- Analytics ---
  '/cogs-engine':     mgmt,                                           // COGS Engine       (N / N / R / F / F)
  '/menu-engineering':upperMgmt,                                      // Menu Engineering  (N / N / N / R / F)
  '/menu-pricing':    upperMgmt,                                      // Menu Pricing      (N / N / N / R / F)
  '/smart-insights':  upperMgmt,                                      // Smart Insights    (N / N / R / F / F)

  // --- HR & Settings ---
  '/hr-payroll':      everyone,                                       // HR & Payroll (S / S / F / R / F)
  '/settings':        ['owner'],                                      // Settings    (N / N / F / F / F)
  '/profile':         everyone,                                       // Profile      (all roles)
};

// ---------------------------------------------------------------------------
// Sidebar nav items — uses the same permission map
// ---------------------------------------------------------------------------
export const SIDEBAR_ITEMS = [
  { label: 'Main', type: 'section' },
  { to: '/',                label: 'แดชบอร์ด',              icon: 'LayoutDashboard', roles: ROUTE_PERMISSIONS['/'] },

  { label: 'Operations', type: 'section' },
  { to: '/attendance',      label: 'ลงเวลา (M1)',           icon: 'Clock',           roles: ROUTE_PERMISSIONS['/attendance'] },
  { to: '/shifts',          label: 'เปิด-ปิดกะ (M2)',       icon: 'ArrowLeftRight',  roles: ROUTE_PERMISSIONS['/shifts'] },
  { to: '/pos',             label: 'ขายหน้าร้าน (M3A)',     icon: 'ShoppingCart',    roles: ROUTE_PERMISSIONS['/pos'] },
  { to: '/expenses',        label: 'ค่าใช้จ่าย (M3B)',      icon: 'Receipt',         roles: ROUTE_PERMISSIONS['/expenses'] },

  { label: 'Cash Management', type: 'section' },
  { to: '/cash-ledger',     label: 'เงินค้างกะ (M4)',       icon: 'Wallet',          roles: ROUTE_PERMISSIONS['/cash-ledger'] },
  { to: '/ar-management',   label: 'ลูกหนี้-AR (M5)',       icon: 'Users',           roles: ROUTE_PERMISSIONS['/ar-management'] },
  { to: '/profit-dashboard',label: 'ตู้เซฟและกำไร (M6)',    icon: 'LineChart',       roles: ROUTE_PERMISSIONS['/profit-dashboard'] },

  { label: 'Inventory', type: 'section' },
  { to: '/inventory',       label: 'คลังสินค้า (M7A)',      icon: 'Package',         roles: ROUTE_PERMISSIONS['/inventory'] },
  { to: '/purchase-orders', label: 'สั่งซื้อวัตถุดิบ (PO)',  icon: 'ShoppingCart',    roles: ROUTE_PERMISSIONS['/purchase-orders'] },
  { to: '/stock-receiving', label: 'รับของ GRN (M7B)',       icon: 'PackagePlus',     roles: ROUTE_PERMISSIONS['/stock-receiving'] },
  { to: '/bom',             label: 'สูตรอาหาร (BOM) (M7C)', icon: 'Receipt',         roles: ROUTE_PERMISSIONS['/bom'] },

  { label: 'Analytics & Intelligence', type: 'section' },
  { to: '/cogs-engine',     label: 'COGS Engine (M8)',      icon: 'PieChart',        roles: ROUTE_PERMISSIONS['/cogs-engine'] },
  { to: '/menu-engineering',label: 'Menu Engineering (M9)',  icon: 'BarChart',        roles: ROUTE_PERMISSIONS['/menu-engineering'] },

  { label: 'Pricing & Smart Insights', type: 'section' },
  { to: '/menu-pricing',    label: 'Menu Pricing (M11)',    icon: 'Tags',            roles: ROUTE_PERMISSIONS['/menu-pricing'] },
  { to: '/smart-insights',  label: 'Smart Insights (M12)',  icon: 'Lightbulb',       roles: ROUTE_PERMISSIONS['/smart-insights'] },

  { label: 'HR & Payroll', type: 'section' },
  { to: '/hr-payroll',      label: 'HR & Payroll (M13)',    icon: 'UserCheck',       roles: ROUTE_PERMISSIONS['/hr-payroll'] },

  { label: 'ระบบ', type: 'section' },
  { to: '/settings',        label: 'ตั้งค่า',               icon: 'Settings',        roles: ROUTE_PERMISSIONS['/settings'] },
  { to: '/profile',         label: 'โปรไฟล์ของฉัน',          icon: 'UserCircle',      roles: ROUTE_PERMISSIONS['/profile'] },
];

/** Human-readable role labels (Thai) */
export const ROLE_LABELS = {
  owner:         'เจ้าของ',
  manager:       'Area Manager',
  store_manager: 'ผู้จัดการสาขา',
  cook:          'พ่อครัว',
  staff:         'พนักงาน',
};

/**
 * Check if a role has access to a given path.
 * Returns true if allowed, false otherwise.
 */
export function hasAccess(role, path) {
  const allowed = ROUTE_PERMISSIONS[path];
  if (!allowed) return true; // unknown routes default to allowed (e.g. 404)
  return allowed.includes(role);
}
