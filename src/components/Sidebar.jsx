import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { SIDEBAR_ITEMS, ROLE_LABELS } from '../config/roles';
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
  UserCircle,
} from 'lucide-react';

/** Map icon name strings → actual Lucide components */
const ICON_MAP = {
  LayoutDashboard,
  Clock,
  ArrowLeftRight,
  ShoppingCart,
  Receipt,
  Settings,
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
  UserCircle,
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
        {SIDEBAR_ITEMS.map((item, idx) => {
          // Role-based visibility for nav links
          if (item.roles && user && !item.roles.includes(user.role)) return null;

          // Section headers — only show if at least one child is visible
          if (item.type === 'section') {
            const nextSectionIdx = SIDEBAR_ITEMS.findIndex((n, i) => i > idx && n.type === 'section');
            const endIdx = nextSectionIdx === -1 ? SIDEBAR_ITEMS.length : nextSectionIdx;
            const children = SIDEBAR_ITEMS.slice(idx + 1, endIdx);
            const hasVisibleChildren = children.some(
              child => !child.roles || (user && child.roles.includes(user.role))
            );
            if (!hasVisibleChildren) return null;

            return (
              <div key={idx} className="nav-section-title">
                {item.label}
              </div>
            );
          }

          const Icon = ICON_MAP[item.icon];
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `nav-item ${isActive ? 'active' : ''}`
              }
              end={item.to === '/'}
            >
              {Icon && <Icon />}
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
              {user ? ROLE_LABELS[user.role] || user.role : ''} <br/> 
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
