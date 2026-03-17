import { useState, useEffect } from 'react';
import { 
  PieChart, 
  TrendingDown, 
  AlertTriangle, 
  DollarSign, 
  Calendar,
  AlertCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';

/*
  Supabase Integration (M8 — COGS Engine):
  - menu_items: price, cost (true cost per item)
  - pos_order_items + pos_orders: qty_sold ตาม dateRange
  - fixed_costs: labor, rent, utilities (type + amount + period_month)
  - Yield Loss = ประมาณจาก cost variance (ถ้าไม่มี recipe_bom ให้แสดง 0)
*/

export default function COGSEngine() {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('month'); // today, week, month
  
  const [metrics, setMetrics] = useState({
    avgFoodCostPct: 0,
    totalCogs: 0,
    yieldLossCost: 0,
    varianceAlerts: 0
  });

  const [menuData, setMenuData] = useState([]);
  const [costStructure, setCostStructure] = useState({
    foodCost: 0,
    labor: 0,
    rent: 0,
    utilities: 0
  });

  useEffect(() => {
    loadAnalytics();
  }, [dateRange]);

  function getDateRange(range) {
    const now = new Date();
    let start, end;
    if (range === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    } else if (range === 'week') {
      const day = now.getDay() || 7;
      start = new Date(now);
      start.setDate(now.getDate() - day + 1);
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
      end.setHours(23, 59, 59, 999);
    } else { // month
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }
    return {
      startStr: start.toISOString(),
      endStr: end.toISOString(),
      monthStr: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    };
  }

  async function loadAnalytics() {
    setLoading(true);
    try {
      const { startStr, endStr, monthStr } = getDateRange(dateRange);

      // 1. ดึง menu_items ทั้งหมด (name, price, cost)
      const { data: menuItems, error: menuErr } = await supabase
        .from('menu_items')
        .select('id, name, price, cost')
        .eq('is_active', true);

      if (menuErr) throw menuErr;

      // 2. ดึง pos_order_items ตาม dateRange โดย join pos_orders
      const { data: orderItems, error: itemErr } = await supabase
        .from('pos_order_items')
        .select('menu_item_id, quantity, pos_orders!inner(created_at, status)')
        .gte('pos_orders.created_at', startStr)
        .lte('pos_orders.created_at', endStr)
        .eq('pos_orders.status', 'completed');

      if (itemErr) {
        console.warn('COGSEngine: pos_order_items join error:', itemErr.message);
      }

      // 3. รวม qty_sold รายเมนู
      const qtySoldMap = {};
      (orderItems || []).forEach(item => {
        const id = item.menu_item_id;
        qtySoldMap[id] = (qtySoldMap[id] || 0) + Number(item.quantity);
      });

      // 4. คำนวณ COGS ต่อเมนู (ไม่มี recipe_bom → ใช้ cost จาก menu_items โดยตรง)
      const processedMenus = (menuItems || []).map(menu => {
        const sellingPrice = Number(menu.price);
        const trueCost = Number(menu.cost);
        const qtySold = qtySoldMap[menu.id] || 0;
        const fcPct = sellingPrice > 0 ? (trueCost / sellingPrice) * 100 : 0;
        const margin = sellingPrice - trueCost;
        const totalCogs = trueCost * qtySold;
        // ไม่มี recipe_bom → yieldLossValue = 0
        const yieldLossValue = 0;
        const isHighFC = fcPct > 35;
        const hasVariance = false; // ต้องการ recipe_bom เพื่อคำนวณ variance จริง

        return {
          ...menu,
          sellingPrice,
          trueCost,
          qtySold,
          fcPct,
          margin,
          totalCogs,
          yieldLossValue,
          isHighFC,
          hasVariance
        };
      });

      const totalRevenue = processedMenus.reduce((sum, m) => sum + (m.sellingPrice * m.qtySold), 0);
      const totalCogs = processedMenus.reduce((sum, m) => sum + m.totalCogs, 0);
      const avgFcPct = totalRevenue > 0 ? (totalCogs / totalRevenue) * 100 : 0;

      setMenuData(processedMenus.filter(m => m.qtySold > 0 || processedMenus.every(x => x.qtySold === 0)));
      setMetrics({
        avgFoodCostPct: avgFcPct,
        totalCogs,
        yieldLossCost: 0,
        varianceAlerts: 0
      });

      // 5. ดึง fixed_costs สำหรับ cost structure benchmark
      const { data: fixedCosts } = await supabase
        .from('fixed_costs')
        .select('type, amount')
        .eq('period_month', monthStr);

      const laborAmt = (fixedCosts || []).filter(f => f.type === 'labor').reduce((s, f) => s + Number(f.amount), 0);
      const rentAmt = (fixedCosts || []).filter(f => f.type === 'rent').reduce((s, f) => s + Number(f.amount), 0);
      const utilAmt = (fixedCosts || []).filter(f => f.type === 'utilities').reduce((s, f) => s + Number(f.amount), 0);

      const base = totalRevenue > 0 ? totalRevenue : 1; // ป้องกัน div/0
      setCostStructure({
        foodCost: totalRevenue > 0 ? (totalCogs / base) * 100 : 0,
        labor: totalRevenue > 0 ? (laborAmt / base) * 100 : 0,
        rent: totalRevenue > 0 ? (rentAmt / base) * 100 : 0,
        utilities: totalRevenue > 0 ? (utilAmt / base) * 100 : 0
      });

    } catch (err) {
      console.error('COGSEngine error:', err);
    } finally {
      setLoading(false);
    }
  }

  const getStatusColor = (current, min, max) => {
    if (current > max) return 'var(--accent-danger)';
    if (current < min) return 'var(--accent-info)';
    return 'var(--accent-success)';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700 }}>COGS Engine</h3>
          <p className="text-sm text-muted">M8: วิเคราะห์ต้นทุนขาย (True Cost & Yield Loss)</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Calendar size={18} className="text-muted" />
          <select 
            className="form-select" 
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            style={{ width: '180px' }}
          >
            <option value="today">วันนี้</option>
            <option value="week">สัปดาห์นี้</option>
            <option value="month">เดือนนี้</option>
          </select>
        </div>
      </div>

      {/* Primary Metrics */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className={`stat-icon ${metrics.avgFoodCostPct > 35 ? 'red' : 'green'}`}>
            <PieChart size={22} />
          </div>
          <div className="stat-info">
            <h3 style={{ color: metrics.avgFoodCostPct > 35 ? 'var(--accent-danger)' : 'var(--text-primary)' }}>
              {metrics.avgFoodCostPct.toFixed(1)}%
            </h3>
            <p>Food Cost % (เป้า 28-35%)</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue">
            <DollarSign size={22} />
          </div>
          <div className="stat-info">
            <h3>฿{metrics.totalCogs.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
            <p>รวมต้นทุนของที่ขายไป</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange">
            <TrendingDown size={22} />
          </div>
          <div className="stat-info">
            <h3>฿{metrics.yieldLossCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
            <p>มูลค่าสูญเสียจาก Yield Loss</p>
          </div>
        </div>
        <div className="stat-card">
          <div className={`stat-icon ${metrics.varianceAlerts > 0 ? 'red' : 'purple'}`}>
            <AlertTriangle size={22} />
          </div>
          <div className="stat-info">
            <h3 style={{ color: metrics.varianceAlerts > 0 ? 'var(--accent-danger)' : 'var(--text-primary)' }}>
              {metrics.varianceAlerts} รายการ
            </h3>
            <p>ใช้วัตถุดิบจริง &gt; ทฤษฎี (BOM)</p>
          </div>
        </div>
      </div>

      {/* Cost Structure Benchmark */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <h4 style={{ fontSize: '15px', fontWeight: 600 }}>โครงสร้างต้นทุนเทียบเป้าหมาย (Cost Structure Benchmark)</h4>
        </div>
        <div style={{ padding: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
            
            {/* FC */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                <span style={{ fontWeight: 600 }}>วัตถุดิบ (Food Cost)</span>
                <span style={{ color: getStatusColor(costStructure.foodCost, 28, 35), fontWeight: 600 }}>{costStructure.foodCost.toFixed(1)}%</span>
              </div>
              <div style={{ height: '8px', background: 'var(--bg-secondary)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(costStructure.foodCost, 100)}%`, background: getStatusColor(costStructure.foodCost, 28, 35), borderRadius: '4px' }} />
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', textAlign: 'right' }}>Target: 28-35%</div>
            </div>

            {/* Labor */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                <span style={{ fontWeight: 600 }}>ค่าแรง (Labor)</span>
                <span style={{ color: getStatusColor(costStructure.labor, 20, 30), fontWeight: 600 }}>{costStructure.labor.toFixed(1)}%</span>
              </div>
              <div style={{ height: '8px', background: 'var(--bg-secondary)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(costStructure.labor, 100)}%`, background: getStatusColor(costStructure.labor, 20, 30), borderRadius: '4px' }} />
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', textAlign: 'right' }}>Target: 20-30%</div>
            </div>

            {/* Rent */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                <span style={{ fontWeight: 600 }}>ค่าเช่า (Rent)</span>
                <span style={{ color: getStatusColor(costStructure.rent, 10, 20), fontWeight: 600 }}>{costStructure.rent.toFixed(1)}%</span>
              </div>
              <div style={{ height: '8px', background: 'var(--bg-secondary)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(costStructure.rent, 100)}%`, background: getStatusColor(costStructure.rent, 10, 20), borderRadius: '4px' }} />
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', textAlign: 'right' }}>Target: 10-20%</div>
            </div>

            {/* Utilities */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                <span style={{ fontWeight: 600 }}>น้ำไฟ (Utilities)</span>
                <span style={{ color: getStatusColor(costStructure.utilities, 3, 7), fontWeight: 600 }}>{costStructure.utilities.toFixed(1)}%</span>
              </div>
              <div style={{ height: '8px', background: 'var(--bg-secondary)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(costStructure.utilities, 100)}%`, background: getStatusColor(costStructure.utilities, 3, 7), borderRadius: '4px' }} />
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', textAlign: 'right' }}>Target: 3-7%</div>
            </div>

          </div>
        </div>
      </div>

      {/* Menu COGS Table */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h4 style={{ fontSize: '15px', fontWeight: 600 }}>วิเคราะห์ต้นทุนแยกรายเมนู (Menu-level COGS)</h4>
          {metrics.varianceAlerts > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--accent-warning)', background: 'var(--accent-warning-bg)', padding: '6px 12px', borderRadius: 'var(--radius-full)' }}>
              <AlertCircle size={14} /> พบเมนูที่อาจมีการสูญเสียเกินเกณฑ์ {metrics.varianceAlerts} รายการ
            </div>
          )}
        </div>
        
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>เมนู (Menu Item)</th>
                <th style={{ textAlign: 'right' }}>จำนวนขาย</th>
                <th style={{ textAlign: 'right' }}>ราคาขาย (฿)</th>
                <th style={{ textAlign: 'right' }}>ต้นทุนจริง/จาน (฿)</th>
                <th style={{ textAlign: 'right' }}>Food Cost %</th>
                <th style={{ textAlign: 'right' }}>กำไรขั้นต้น (Margin)</th>
                <th>แจ้งเตือน Variance</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px' }}><span className="animate-pulse">กำลังคำนวณต้นทุน...</span></td></tr>
              ) : menuData.length === 0 ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>ยังไม่มีข้อมูลเมนูในระบบ — กรุณาเพิ่มเมนูใน Settings</td></tr>
              ) : menuData.map(menu => (
                <tr key={menu.id}>
                  <td style={{ fontWeight: 600 }}>{menu.name}</td>
                  <td style={{ textAlign: 'right' }}>{menu.qtySold}</td>
                  <td style={{ textAlign: 'right' }}>{menu.sellingPrice.toFixed(2)}</td>
                  <td style={{ textAlign: 'right', color: menu.hasVariance ? 'var(--accent-warning)' : 'inherit' }}>
                    {menu.trueCost.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span className={`badge ${menu.isHighFC ? 'badge-danger' : 'badge-success'}`}>
                      {menu.fcPct.toFixed(1)}%
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--accent-success)' }}>
                    +{menu.margin.toFixed(2)}
                  </td>
                  <td>
                    {menu.hasVariance ? (
                      <span style={{ fontSize: '12px', color: 'var(--accent-danger)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <AlertTriangle size={12} /> ใช้จริง &gt; ทฤษฎี
                      </span>
                    ) : (
                      <span className="text-muted" style={{ fontSize: '12px' }}>ปกติ</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
