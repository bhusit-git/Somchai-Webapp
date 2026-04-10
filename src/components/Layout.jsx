import { Outlet, useLocation } from 'react-router-dom';
import { Bell, Search, Sun, Moon, Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useState, useEffect } from 'react';

const pageTitles = {
  '/': 'แดชบอร์ด',
  '/attendance': 'ลงเวลา (M1)',
  '/shifts': 'เปิด-ปิดกะ (M2)',
  '/pos': 'ขายหน้าร้าน (M3A)',
  '/sales-history': 'รายการขาย',
  '/expenses': 'ค่าใช้จ่าย (M3B)',
  '/ar-management': 'ลูกหนี้-AR (M5)',
  '/profit-dashboard': 'ตู้เซฟและกำไร (M6)',
  '/inventory': 'คลังสินค้า (M7A)',
  '/stock-receiving': 'รับของ GRN (M7B)',
  '/cogs-engine': 'COGS Engine (M8)',
  '/menu-engineering': 'Menu Engineering (M9)',
  '/menu-pricing': 'Menu Pricing (M11)',
  '/smart-insights': 'Smart Insights (M12)',
  '/hr-payroll': 'HR & Payroll (M13)',
  '/settings': 'ตั้งค่าระบบ',
};
export default function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const title = pageTitles[location.pathname] || 'Somchai App';

  // Close sidebar on mobile when navigating
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-layout">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-[150] md:hidden backdrop-blur-sm" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <main className="main-content">
        <header className="main-header">
          <div className="main-header-left">
            <button 
              className="btn-icon md:hidden mr-2 flex-shrink-0" 
              onClick={() => setIsSidebarOpen(true)}
              title="เปิดเมนู"
            >
              <Menu size={20} />
            </button>
            <h2 className="truncate max-w-[150px] sm:max-w-none">{title}</h2>
          </div>
          <div className="main-header-right">
            <button className="btn-icon" title="ค้นหา">
              <Search size={18} />
            </button>
            <button className="btn-icon" title="สลับธีม มืด/สว่าง" onClick={toggleTheme}>
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <button className="btn-icon" title="แจ้งเตือน">
              <Bell size={18} />
            </button>
            <span className="bg-violet-500/10 text-violet-400 border border-violet-500/20 px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 shadow-sm shadow-violet-900/20">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse"></span>
              {user?.branch_name || 'ไม่ระบุสาขา'}
            </span>
          </div>
        </header>
        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
