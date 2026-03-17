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

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="attendance" element={<Attendance />} />
              <Route path="shifts" element={<Shifts />} />
              <Route path="pos" element={<POS />} />
              <Route path="expenses" element={<Expenses />} />
              <Route path="cash-ledger" element={<CashLedger />} />
              <Route path="ar-management" element={<ARManagement />} />
              <Route path="profit-dashboard" element={<ProfitDashboard />} />
              <Route path="inventory" element={<Inventory />} />
              <Route path="stock-receiving" element={<StockReceiving />} />
              <Route path="cogs-engine" element={<COGSEngine />} />
              <Route path="menu-engineering" element={<MenuEngineering />} />
              <Route path="menu-pricing" element={<MenuPricing />} />
              <Route path="smart-insights" element={<SmartInsights />} />
              <Route path="hr-payroll" element={<HRPayroll />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
