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
    startingCash: 0,
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

      // Real COGS calculation
      let todayCOGS = 0;
      let topList = [];
      if (todayTx && todayTx.length > 0) {
        const txIds = todayTx.map(t => t.id);
        const { data: txItems } = await supabase
          .from('transaction_items')
          .select('product_name, quantity, total_price, products(cost)')
          .in('transaction_id', txIds);
           
        if (txItems) {
           const itemMap = {};
           txItems.forEach(item => {
             const cost = Number(item.products?.cost || 0);
             todayCOGS += (Number(item.quantity) * cost);

             const name = item.product_name;
             if (!itemMap[name]) itemMap[name] = { qty: 0, price: 0 };
             itemMap[name].qty += Number(item.quantity);
             itemMap[name].price += Number(item.total_price);
           });
           
           topList = Object.entries(itemMap)
             .map(([k, v]) => ({ name: k, qty: v.qty, price: v.price }))
             .sort((a,b) => b.qty - a.qty)
             .slice(0, 5);
        }
      }
      
      const realFC = tSales > 0 ? (todayCOGS / tSales) * 100 : 0;
      const realGP = tSales > 0 ? ((tSales - todayCOGS) / tSales) * 100 : 0;

      setStats({
        todaySales: tSales,
        totalOrders: tOrders,
        todayExpenses: tExpenses,
        foodCost: realFC,
        grossProfit: realGP,
        cashDrawer: cashDrawer,
        startingCash: startingCash,
      });
      setTopItems(topList);

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
      const dayIndexMap = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };
      
      const prevWeekData = [0, 0, 0, 0, 0, 0, 0];
      const thisWeekData = [0, 0, 0, 0, 0, 0, 0];
      
      if (twoWeeksTx) {
        twoWeeksTx.forEach(tx => {
           const date = new Date(tx.created_at);
           const dayIdx = dayIndexMap[date.getDay()];
           if (date >= sevenDaysAgo) {
             thisWeekData[dayIdx] += Number(tx.total);
           } else {
             prevWeekData[dayIdx] += Number(tx.total);
           }
        });
      }

      setChartData({
        labels: dayLabels,
        prevWeek: prevWeekData,
        thisWeek: thisWeekData,
      });

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

  const initials = user?.name ? user.name.substring(0, 2) : 'พย';
  const isManager = ['store_manager', 'manager', 'owner', 'admin'].includes(user?.role);

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
          {hasAlerts && isManager && (
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
            {isManager && (
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
            )}

            {/* Gross Profit */}
            {isManager && (
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
            )}
          </div>

          {/* Zone 2b: Checklist + Cash Drawer */}
          <div className="row">
            {/* Checklist */}
            <div className="card">
              <div className="card-title">Ops Checklist วันนี้</div>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '12px' }}>ไม่มีข้อมูล Checklist สำหรับกะนี้</div>
            </div>

            {/* Cash Drawer */}
            <div className="card">
              <div className="card-title">เงินสดในลิ้นชัก (กะนี้)</div>
              <div className="card-val">฿{stats.cashDrawer.toLocaleString()}</div>
              <div className="card-sub">เงินทอนตั้งต้น ฿{(stats.startingCash || 0).toLocaleString()}  |  รับสด ฿{stats.todaySales.toLocaleString()}</div>
              <div className="card-sub">จ่ายค่าใช้จ่าย ฿{stats.todayExpenses.toLocaleString()}</div>
            </div>
          </div>

          {/* Manager views below this point */}
          {isManager && (
            <>
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
                </div>
                <table className="items-table">
                  <tbody>
                    {topItems.length > 0 ? topItems.map((item, idx) => (
                      <tr key={idx}>
                        <td>#{idx + 1}</td>
                        <td>{item.name}</td>
                        <td>{item.qty} จาน</td>
                        <td>฿{item.price.toLocaleString()}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan="4" style={{ textAlign: 'center', color: '#888' }}>ยังไม่มีการขายวันนี้</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
