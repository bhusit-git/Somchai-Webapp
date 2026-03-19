import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Attendance from './pages/Attendance';
import Shifts from './pages/Shifts';
import POS from './pages/POS';
import Expenses from './pages/Expenses';
import CashLedger from './pages/CashLedger';
import ARManagement from './pages/ARManagement';
import ProfitDashboard from './pages/ProfitDashboard';
import Inventory from './pages/Inventory';
import StockReceiving from './pages/StockReceiving';
import COGSEngine from './pages/COGSEngine';
import MenuEngineering from './pages/MenuEngineering';
import MenuPricing from './pages/MenuPricing';
import SmartInsights from './pages/SmartInsights';
import HRPayroll from './pages/HRPayroll';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import { ROUTE_PERMISSIONS } from './config/roles';

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<ProtectedRoute allowedRoles={ROUTE_PERMISSIONS['/']}><Dashboard /></ProtectedRoute>} />
              <Route path="attendance" element={<ProtectedRoute allowedRoles={ROUTE_PERMISSIONS['/attendance']}><Attendance /></ProtectedRoute>} />
              <Route path="shifts" element={<ProtectedRoute allowedRoles={ROUTE_PERMISSIONS['/shifts']}><Shifts /></ProtectedRoute>} />
              <Route path="pos" element={<ProtectedRoute allowedRoles={ROUTE_PERMISSIONS['/pos']}><POS /></ProtectedRoute>} />
              <Route path="expenses" element={<ProtectedRoute allowedRoles={ROUTE_PERMISSIONS['/expenses']}><Expenses /></ProtectedRoute>} />
              <Route path="cash-ledger" element={<ProtectedRoute allowedRoles={ROUTE_PERMISSIONS['/cash-ledger']}><CashLedger /></ProtectedRoute>} />
              <Route path="ar-management" element={<ProtectedRoute allowedRoles={ROUTE_PERMISSIONS['/ar-management']}><ARManagement /></ProtectedRoute>} />
              <Route path="profit-dashboard" element={<ProtectedRoute allowedRoles={ROUTE_PERMISSIONS['/profit-dashboard']}><ProfitDashboard /></ProtectedRoute>} />
              <Route path="inventory" element={<ProtectedRoute allowedRoles={ROUTE_PERMISSIONS['/inventory']}><Inventory /></ProtectedRoute>} />
              <Route path="stock-receiving" element={<ProtectedRoute allowedRoles={ROUTE_PERMISSIONS['/stock-receiving']}><StockReceiving /></ProtectedRoute>} />
              <Route path="cogs-engine" element={<ProtectedRoute allowedRoles={ROUTE_PERMISSIONS['/cogs-engine']}><COGSEngine /></ProtectedRoute>} />
              <Route path="menu-engineering" element={<ProtectedRoute allowedRoles={ROUTE_PERMISSIONS['/menu-engineering']}><MenuEngineering /></ProtectedRoute>} />
              <Route path="menu-pricing" element={<ProtectedRoute allowedRoles={ROUTE_PERMISSIONS['/menu-pricing']}><MenuPricing /></ProtectedRoute>} />
              <Route path="smart-insights" element={<ProtectedRoute allowedRoles={ROUTE_PERMISSIONS['/smart-insights']}><SmartInsights /></ProtectedRoute>} />
              <Route path="hr-payroll" element={<ProtectedRoute allowedRoles={ROUTE_PERMISSIONS['/hr-payroll']}><HRPayroll /></ProtectedRoute>} />
              <Route path="settings" element={<ProtectedRoute allowedRoles={ROUTE_PERMISSIONS['/settings']}><Settings /></ProtectedRoute>} />
              <Route path="profile" element={<ProtectedRoute allowedRoles={ROUTE_PERMISSIONS['/profile']}><Profile /></ProtectedRoute>} />
            </Route>
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
