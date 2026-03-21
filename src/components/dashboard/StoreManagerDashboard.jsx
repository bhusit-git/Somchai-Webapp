import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Link } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import './StoreManagerDashboard.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

export default function StoreManagerDashboard() {
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    todaySales: 0,
    totalOrders: 0,
    todayExpenses: 0,
    foodCost: 0,
    grossProfit: 0,
    cashDrawer: 0,
  });
  const [alerts, setAlerts] = useState({
    lowStockItems: [],
    openShifts: 0,
  });
  const [topItems, setTopItems] = useState([]);
  const [chartData, setChartData] = useState({ thisWeek: [], prevWeek: [], labels: [] });
  
  const [kpiTargets, setKpiTargets] = useState({
    dailySalesTarget: 50000,
    targetFcPercent: 33,
    targetGpPercent: 60,
  });

  useEffect(() => {
    try {
      const configStr = localStorage.getItem('systemConfig');
      if (configStr) {
        const conf = JSON.parse(configStr);
        setKpiTargets({
          dailySalesTarget: Number(conf.dailySalesTarget || 50000),
          targetFcPercent: Number(conf.targetFcPercent || 33),
          targetGpPercent: Number(conf.targetGpPercent || 60),
        });
      }
    } catch (e) {
      console.error(e);
    }

    if (user?.branch_id) {
      loadData();
    }
  }, [user?.branch_id]);

  async function loadData() {
    if (!user?.branch_id) return;
    setLoading(true);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);
    fourteenDaysAgo.setHours(0, 0, 0, 0);

    try {
      // Data fetching
      const { data: todayTx } = await supabase
        .from('transactions')
        .select('id, total, status, created_at')
        .eq('branch_id', user.branch_id)
        .gte('created_at', todayISO)
        .eq('status', 'completed');

      const { data: twoWeeksTx } = await supabase
        .from('transactions')
        .select('id, total, created_at, status')
        .eq('branch_id', user.branch_id)
        .gte('created_at', fourteenDaysAgo.toISOString())
        .eq('status', 'completed');

      const { data: todayExp } = await supabase
        .from('expenses')
        .select('amount')
        .eq('branch_id', user.branch_id)
        .gte('created_at', todayISO);

      const { data: inventory } = await supabase
        .from('inventory_items')
        .select('name, current_stock, reorder_point')
        .eq('branch_id', user.branch_id)
        .eq('is_active', true);
        
      const { data: activeShift } = await supabase
        .from('shifts')
        .select('starting_cash, status')
        .eq('branch_id', user.branch_id)
        .eq('status', 'open')
        .limit(1);

      // Calculations
      const tSales = (todayTx || []).reduce((sum, tx) => sum + Number(tx.total), 0);
      const tOrders = (todayTx || []).length;
      const tExpenses = (todayExp || []).reduce((sum, e) => sum + Number(e.amount), 0);
      const startingCash = activeShift?.[0]?.starting_cash || 500;
      const cashDrawer = startingCash + tSales - tExpenses; // simplified
      
      const mockCOGS = tSales * 0.362; // Mock 36.2% as in HTML
      const mockFC = tSales > 0 ? (mockCOGS / tSales) * 100 : 0;
      const mockGP = tSales > 0 ? ((tSales - mockCOGS) / tSales) * 100 : 0;

      setStats({
        todaySales: tSales,
        totalOrders: tOrders,
        todayExpenses: tExpenses,
        foodCost: mockFC,
        grossProfit: mockGP,
        cashDrawer: cashDrawer,
      });

      // Alerts
      const lowItems = (inventory || []).filter(item => 
        Number(item.current_stock) <= Number(item.reorder_point) && Number(item.current_stock) > 0
      );
      
      setAlerts({
        lowStockItems: lowItems,
        openShifts: activeShift?.length || 0
      });

      // Chart Data
      const dayLabels = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];
      // Mock data like the HTML file since we might not have 14 days of real DB data
      setChartData({
        labels: dayLabels,
        prevWeek: [32000, 48000, 36000, 55000, 44000, 58000, 52000],
        thisWeek: [29000, 52000, 42000, 61000, 50000, 60000, tSales || 42500],
      });

      // Top Items (mock like HTML)
      setTopItems([
        { name: 'ข้าวผัดกุ้ง', qty: 58, price: 17400 },
        { name: 'ต้มยำกุ้ง', qty: 42, price: 16800 },
        { name: 'ผัดไทยกุ้งสด', qty: 39, price: 7800 },
        { name: 'แกงเขียวหวาน', qty: 31, price: 6200 },
        { name: 'ยำวุ้นเส้น', qty: 28, price: 4200 },
      ]);

    } catch (err) {
      console.error('Error loading manager dashboard:', err);
    } finally {
      setLoading(false);
    }
  }

  // Formatting helpers
  const salesPct = Math.min(100, (stats.todaySales / (kpiTargets.dailySalesTarget || 1)) * 100);
  const gpPct = Math.min(100, (stats.grossProfit / (kpiTargets.targetGpPercent || 1)) * 100);
  const hasAlerts = alerts.lowStockItems.length > 0 || alerts.openShifts === 0;

  // Chart Config
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => `฿${ctx.raw.toLocaleString()}`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 11 }, color: 'var(--text-muted)' },
        border: { display: false },
      },
      y: {
        grid: { color: 'var(--border-secondary)' },
        ticks: {
          font: { size: 10 }, color: 'var(--text-muted)',
          callback: v => '฿' + (v/1000).toFixed(0) + 'k'
        },
        border: { display: false },
      }
    }
  };

  const chartDataset = {
    labels: chartData.labels,
    datasets: [
      {
        label: 'สัปดาห์ก่อน',
        data: chartData.prevWeek,
        backgroundColor: 'var(--border-primary)',
        borderRadius: 4,
        barPercentage: 0.4,
        categoryPercentage: 0.85,
      },
      {
        label: 'สัปดาห์นี้',
        data: chartData.thisWeek,
        backgroundColor: chartData.thisWeek.map((_, i) =>
          i === 6 ? 'var(--accent-primary)' : 'var(--accent-primary-glow)'
        ),
        borderRadius: 4,
        barPercentage: 0.4,
        categoryPercentage: 0.85,
      },
    ],
  };

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>กำลังโหลดหน้า Dashboard...</div>;
  }

  // To display user avatar initials
  const initials = user?.name ? user.name.substring(0, 2) : 'ผจก';

  return (
    <div className="store-manager-dashboard">
      <div className="screen">
        
        {/* Top bar */}
        <div className="topbar">
          <div>
            <div className="topbar-title">{user?.branch_name || 'สาขา ทองหล่อ'}</div>
          </div>
          <div className="topbar-meta">กะเปิด • {new Date().toLocaleDateString('th-TH')}</div>
          <div className="topbar-right">
            <div className="avatar">{initials}</div>
          </div>
        </div>

        <div className="body">
          
          {/* Zone 1: Alert */}
          {hasAlerts && (
            <div className="alert-banner">
              <div className="alert-dot"></div>
              <div>
                {alerts.lowStockItems.length > 0 && `${alerts.lowStockItems[0].name} เหลือ ${alerts.lowStockItems[0].current_stock} — ต่ำกว่าเกณฑ์`}
                {alerts.lowStockItems.length > 0 && alerts.openShifts === 0 && '  |  '}
                {alerts.openShifts === 0 && 'ยังไม่ได้เปิดกะทำงาน'}
              </div>
            </div>
          )}

          {/* Zone 2: KPI Cards */}
          <div className="row">
            {/* Revenue */}
            <div className="card">
              <div className="card-title">ยอดขายวันนี้</div>
              <div className="card-val">฿{stats.todaySales.toLocaleString()}</div>
              <div className="card-sub">เป้า ฿{kpiTargets.dailySalesTarget.toLocaleString()}</div>
              <div className="bar-track">
                <div className="bar-fill blue" style={{ width: `${salesPct}%` }}></div>
              </div>
              <div style={{ fontSize: '10px', color: '#185FA5', textAlign: 'right', marginTop: '3px' }}>
                {salesPct.toFixed(0)}%
              </div>
            </div>

            {/* Food Cost */}
            <div className="card">
              <div className="card-title">Food Cost %</div>
              <div className={`card-val ${stats.foodCost > kpiTargets.targetFcPercent ? 'val-red' : 'val-green'}`}>
                {stats.foodCost.toFixed(1)}%
              </div>
              <div className={`card-sub ${stats.foodCost > kpiTargets.targetFcPercent ? 'val-red' : ''}`}>
                เป้า &le; {kpiTargets.targetFcPercent}%  {stats.foodCost > kpiTargets.targetFcPercent ? '↑ สูงกว่าเป้า' : 'อยู่ในเกณฑ์'}
              </div>
              <div className="bar-track">
                <div className={`bar-fill ${stats.foodCost > kpiTargets.targetFcPercent ? 'red' : 'green'}`} style={{ width: '100%' }}></div>
              </div>
            </div>

            {/* Gross Profit */}
            <div className="card">
              <div className="card-title">Gross Profit</div>
              <div className="card-val val-green">฿{(stats.todaySales - (stats.todaySales * (stats.foodCost/100))).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              <div className="card-sub">GP% = {stats.grossProfit.toFixed(1)}%</div>
              <div className="bar-track">
                <div className="bar-fill green" style={{ width: `${gpPct}%` }}></div>
              </div>
              <div style={{ fontSize: '10px', color: '#3B6D11', textAlign: 'right', marginTop: '3px' }}>
                {gpPct.toFixed(0)}%
              </div>
            </div>
          </div>

          {/* Zone 2b: Checklist + Cash Drawer */}
          <div className="row">
            {/* Checklist */}
            <div className="card">
              <div className="card-title">Ops Checklist วันนี้</div>
              <div className="bar-track" style={{ marginTop: 0, marginBottom: '8px' }}>
                <div className="bar-fill green" style={{ width: '80%' }}></div>
              </div>
              <div style={{ fontSize: '11px', color: '#2c2c2a', marginBottom: '4px' }}>เปิดร้าน 8/10&nbsp;&nbsp;|&nbsp;&nbsp;ปิดร้าน ยังไม่ถึงเวลา</div>
              <div style={{ fontSize: '11px', color: '#E24B4A' }}>ค้าง: เช็คแก๊ส, ถ่ายรูป fridge</div>
            </div>

            {/* Cash Drawer */}
            <div className="card">
              <div className="card-title">เงินสดในลิ้นชัก (กะนี้)</div>
              <div className="card-val">฿{stats.cashDrawer.toLocaleString()}</div>
              <div className="card-sub">เงินทอนตั้งต้น ฿500  |  รับสด ฿{stats.todaySales.toLocaleString()}</div>
              <div className="card-sub">จ่ายค่าใช้จ่าย ฿{stats.todayExpenses.toLocaleString()}</div>
            </div>
          </div>

          {/* Zone 3: Quick Actions */}
          <div>
            <div style={{ fontSize: '11px', color: '#888780', marginBottom: '8px' }}>ทำต่อไป</div>
            <div className="actions-row">
              <Link to="/expenses" className="action-btn">+ บันทึกค่าใช้จ่าย</Link>
              <Link to="/inventory" className="action-btn">สต๊อกคงเหลือ</Link>
              <Link to="/pos" className="action-btn">จุดชำระเงิน POS</Link>
              <Link to="/shifts" className="action-btn">ปิดกะ</Link>
            </div>
          </div>

          {/* Zone 4: 7-day Chart */}
          <div className="card">
            <div className="section-header">
              <span className="section-title">ยอดขาย 7 วันย้อนหลัง</span>
              <span style={{ fontSize: '11px', color: '#888780' }}>vs สัปดาห์ก่อน</span>
            </div>
            <div className="chart-wrap">
              <Bar data={chartDataset} options={chartOptions} />
            </div>
            <div className="legend">
              <div className="legend-item">
                <div className="legend-dot" style={{ background: 'var(--border-primary)' }}></div>
                สัปดาห์ก่อน
              </div>
              <div className="legend-item">
                <div className="legend-dot" style={{ background: 'var(--accent-primary)' }}></div>
                สัปดาห์นี้
              </div>
            </div>
          </div>

          {/* Zone 5: Top Items */}
          <div className="card">
            <div className="section-header">
              <span className="section-title">เมนูขายดีวันนี้ (Top 5)</span>
              <span className="see-all">ดูทั้งหมด &rarr;</span>
            </div>
            <table className="items-table">
              <tbody>
                {topItems.map((item, idx) => (
                  <tr key={idx}>
                    <td>#{idx + 1}</td>
                    <td>{item.name}</td>
                    <td>{item.qty} จาน</td>
                    <td>฿{item.price.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      </div>
    </div>
  );
}
