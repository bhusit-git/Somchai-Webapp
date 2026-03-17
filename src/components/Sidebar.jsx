import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  Clock,
  ArrowLeftRight,
  ShoppingCart,
  Receipt,
  Settings,
  LogOut,
  Wallet,
  Users,
  LineChart,
  Package,
  PackagePlus,
  PieChart,
  BarChart,
  Tags,
  Lightbulb,
  UserCheck,
} from 'lucide-react';

const navItems = [
  { label: 'Main', type: 'section' },
  { to: '/', icon: LayoutDashboard, label: 'แดชบอร์ด' },
  { label: 'Operations', type: 'section' },
  { to: '/attendance', icon: Clock, label: 'ลงเวลา (M1)' },
  { to: '/shifts', icon: ArrowLeftRight, label: 'เปิด-ปิดกะ (M2)' },
  { to: '/pos', icon: ShoppingCart, label: 'ขายหน้าร้าน (M3A)' },
  { to: '/expenses', icon: Receipt, label: 'ค่าใช้จ่าย (M3B)' },
  { label: 'Cash Management', type: 'section' },
  { to: '/cash-ledger', icon: Wallet, label: 'เงินค้างกะ (M4)' },
  { to: '/ar-management', icon: Users, label: 'ลูกหนี้-AR (M5)' },
  { to: '/profit-dashboard', icon: LineChart, label: 'ตู้เซฟและกำไร (M6)' },
  { label: 'Inventory', type: 'section' },
  { to: '/inventory', icon: Package, label: 'คลังสินค้า (M7A)' },
  { to: '/stock-receiving', icon: PackagePlus, label: 'รับของ GRN (M7B)' },
  { label: 'Analytics & Intelligence', type: 'section' },
  { to: '/cogs-engine', icon: PieChart, label: 'COGS Engine (M8)' },
  { to: '/menu-engineering', icon: BarChart, label: 'Menu Engineering (M9)' },
  { label: 'Pricing & Smart Insights', type: 'section' },
  { to: '/menu-pricing', icon: Tags, label: 'Menu Pricing (M11)' },
  { to: '/smart-insights', icon: Lightbulb, label: 'Smart Insights (M12)' },
  { label: 'HR & Payroll', type: 'section' },
  { to: '/hr-payroll', icon: UserCheck, label: 'HR & Payroll (M13)' },
  { label: 'ระบบ', type: 'section' },
  { to: '/settings', icon: Settings, label: 'ตั้งค่า' },
];

const roleLabels = {
  owner: 'เจ้าของ',
  manager: 'ผู้จัดการ',
  store_manager: 'ผู้จัดการสาขา',
  cook: 'พ่อครัว',
  staff: 'พนักงาน',
};

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">S</div>
        <div className="sidebar-brand">
          <h1>Somchai</h1>
          <span>Restaurant CashSync ERP</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item, idx) => {
          if (item.type === 'section') {
            return (
              <div key={idx} className="nav-section-title">
                {item.label}
              </div>
            );
          }
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `nav-item ${isActive ? 'active' : ''}`
              }
              end={item.to === '/'}
            >
              <Icon />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user mb-4">
          <div className="sidebar-user-avatar">{user?.name?.charAt(0) || 'U'}</div>
          <div className="sidebar-user-info max-w-[120px]">
            <div className="sidebar-user-name truncate text-slate-200">{user?.name || 'Guest'}</div>
            <div className="sidebar-user-role text-xs text-slate-400">
              {user ? roleLabels[user.role] || user.role : ''} <br/> 
              <span className="text-[10px] text-violet-400">{user?.branch_name}</span>
            </div>
          </div>
        </div>
        <button 
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-red-400 transition-colors p-2 rounded-lg hover:bg-red-500/10 text-sm font-medium"
        >
          <LogOut className="w-4 h-4" /> ออกจากระบบ
        </button>
      </div>
    </aside>
  );
}
