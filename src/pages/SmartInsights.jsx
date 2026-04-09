import { useState, useEffect, useMemo } from 'react';
import {
  Lightbulb,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Activity,
  CheckCircle,
  Calendar,
  Building2,
  BellRing,
  Award,
  RefreshCw,
  Package,
  DollarSign,
  BarChart2,
  ShoppingCart,
  AlertCircle,
  ArrowRight,
  Zap,
  Target,
  Users
} from 'lucide-react';
import { supabase } from '../lib/supabase';

/*
  Supabase Tables (M12 — Smart Insights):
  - products:          id, name, price, cost, is_available
  - transactions:      id, total, created_at, status, branch_id
  - transaction_items: product_id, product_name, quantity, total_price
  - expenses:          amount, category, created_at, status
  - fixed_costs:       type, amount, period_month
  - inventory_items:   name, current_stock, reorder_point, par_level, cost_per_stock_unit
  - menu_item_ingredients: menu_item_id, inventory_item_id, qty_required
  - branches:          id, name
  - users:             id, is_active
  - attendance:        user_id, type, timestamp
*/

const fmtB = n => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// ─── Health Score Ring ───────────────────────────────────────────────────────
function HealthRing({ score, size = 140 }) {
  const r = size / 2 - 12;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 80 ? 'var(--accent-success)' : score >= 50 ? 'var(--accent-warning)' : 'var(--accent-danger)';
  const grade = score >= 90 ? 'A+' : score >= 80 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D';

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-secondary)" strokeWidth="10" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1.2s ease-in-out', transform: 'rotate(-90deg)', transformOrigin: 'center' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: '36px', fontWeight: 800, lineHeight: 1, color }}>{score}</span>
        <span style={{ fontSize: '13px', fontWeight: 700, color, marginTop: '2px' }}>{grade}</span>
      </div>
    </div>
  );
}

// ─── Mini Ring ───────────────────────────────────────────────────────────────
function MiniRing({ progress, color, title, subtitle, icon }) {
  const size = 90, r = size / 2 - 8, circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(progress, 100) / 100) * circ;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-secondary)" strokeWidth="7" />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="7"
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s ease', transform: 'rotate(-90deg)', transformOrigin: 'center' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '18px', fontWeight: 800 }}>{Math.round(progress)}%</span>
        </div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '12px', fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{subtitle}</div>
      </div>
    </div>
  );
}

// ─── Heatmap Row ─────────────────────────────────────────────────────────────
function HeatmapGrid({ data, dayLabels }) {
  const maxRev = Math.max(...data.map(d => d.revenue), 1);
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
        {dayLabels.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
        {data.map((h, i) => {
          const pct = h.revenue / maxRev;
          const alpha = h.revenue === 0 ? 0.06 : 0.15 + pct * 0.85;
          return (
            <div key={i} style={{
              aspectRatio: '1', borderRadius: '6px',
              background: `rgba(16, 185, 129, ${alpha})`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              border: '1px solid var(--border-primary)',
              cursor: h.revenue > 0 ? 'pointer' : 'default',
              position: 'relative'
            }} title={`วันที่ ${h.day}: ฿${fmtB(h.revenue)}`}>
              {h.revenue > maxRev * 0.7 && <span style={{ fontSize: '10px' }}>🔥</span>}
              <span style={{ fontSize: '10px', fontWeight: h.revenue > 0 ? 600 : 400, color: h.revenue > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {h.day}
              </span>
              {h.revenue > 0 && <span style={{ fontSize: '8px', color: 'var(--text-muted)' }}>{fmtB(h.revenue / 1000)}k</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Insight Card ─────────────────────────────────────────────────────────────
const INSIGHT_STYLES = {
  success: { bg: 'var(--accent-success-bg)', color: 'var(--accent-success)', borderColor: 'var(--accent-success)' },
  warning: { bg: 'var(--accent-warning-bg)', color: 'var(--accent-warning)', borderColor: 'var(--accent-warning)' },
  danger:  { bg: 'var(--accent-danger-bg)',  color: 'var(--accent-danger)',  borderColor: 'var(--accent-danger)' },
  info:    { bg: 'var(--accent-info-bg)',    color: 'var(--accent-info)',    borderColor: 'var(--accent-info)' },
  tip:     { bg: 'var(--accent-purple-bg)',  color: 'var(--accent-purple)',  borderColor: 'var(--accent-purple)' }
};

function InsightCard({ icon, type, title, text, metric }) {
  const st = INSIGHT_STYLES[type] || INSIGHT_STYLES.info;
  return (
    <div style={{
      display: 'flex', gap: '14px', padding: '14px 16px',
      background: 'var(--bg-card)', borderLeft: `4px solid ${st.borderColor}`,
      borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
      transition: 'background 0.15s'
    }}>
      <div style={{
        width: '34px', height: '34px', borderRadius: '50%',
        background: st.bg, color: st.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '2px', color: 'var(--text-primary)' }}>{title}</div>}
        <div style={{ fontSize: '12px', lineHeight: 1.55, color: 'var(--text-secondary)' }}>{text}</div>
      </div>
      {metric && (
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '16px', fontWeight: 800, color: st.color }}>{metric.value}</div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{metric.label}</div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function SmartInsights() {
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Month picker state — default to current month
  const now0 = new Date();
  const [selectedMonth, setSelectedMonth] = useState(
    `${now0.getFullYear()}-${String(now0.getMonth() + 1).padStart(2, '0')}`
  );

  const [healthScore, setHealthScore] = useState(0);
  const [rings, setRings]             = useState({ salesTarget: 0, fc: 0, compliance: 0 });
  const [heatmap, setHeatmap]         = useState([]);
  const [insights, setInsights]       = useState([]);
  const [topSellers, setTopSellers]   = useState([]);
  const [bottomSellers, setBottomSellers] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);

  useEffect(() => { loadData(); }, [selectedMonth]);

  async function loadData(isRefresh = false) {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const now = new Date();
      // Parse selectedMonth ("YYYY-MM") to derive range
      const [selYear, selMon] = selectedMonth.split('-').map(Number);
      const year = selYear;
      const month = selMon - 1; // 0-indexed
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      // If the selected month is the current month, todayDay = current date; otherwise full month
      const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
      const todayDay = isCurrentMonth ? now.getDate() : daysInMonth;
      const monthStr = selectedMonth;
      const monthStart = `${monthStr}-01T00:00:00`;
      const monthEnd = `${monthStr}-${String(daysInMonth).padStart(2, '0')}T23:59:59`;

      // Yesterday
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yestStr = yesterday.toISOString().split('T')[0];

      // Last month same range (for comparison)
      const lastMonth = new Date(year, month - 1, 1);
      const lmStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
      const lmDays = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0).getDate();
      const lmStart = `${lmStr}-01T00:00:00`;
      const lmEnd = `${lmStr}-${String(Math.min(todayDay, lmDays)).padStart(2, '0')}T23:59:59`;

      // ═══ Parallel data fetch ═══
      const [
        txRes, txItemsRes, lmTxRes, productsRes, expensesRes, fixedRes, invRes, userRes, bomRes
      ] = await Promise.all([
        supabase.from('transactions').select('id, total, created_at, status').gte('created_at', monthStart).lte('created_at', monthEnd),
        supabase.from('transaction_items').select('product_id, product_name, quantity, unit_price, total_price, transactions!inner(created_at, status)').gte('transactions.created_at', monthStart).lte('transactions.created_at', monthEnd).eq('transactions.status', 'completed'),
        supabase.from('transactions').select('total, status').gte('created_at', lmStart).lte('created_at', lmEnd),
        supabase.from('products').select('id, name, price, cost, is_available'),
        supabase.from('expenses').select('amount, category, created_at, status, payment_method').gte('created_at', monthStart).lte('created_at', monthEnd),
        supabase.from('expense_categories').select('name, is_fixed_cost').eq('is_active', true),
        supabase.from('inventory_items').select('id, name, current_stock, reorder_point, par_level, cost_per_stock_unit').eq('is_active', true),
        supabase.from('users').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('menu_item_ingredients').select('menu_item_id, inventory_item_id, qty_required')
      ]);

      const txData = txRes.data || [];
      const txItems = txItemsRes.data || [];
      const lmTxData = lmTxRes.data || [];
      const products = productsRes.data || [];
      const expenses = expensesRes.data || [];
      const fixedCostsRaw = fixedRes.data || [];
      const invItems = invRes.data || [];
      const activeUsers = userRes.count || 0;
      const bomData = bomRes.data || [];

      // Map expense categories by is_fixed_cost flag
      const fixedCostCatNames = fixedCostsRaw.filter(c => c.is_fixed_cost).map(c => c.name);

      // ═══ Computed Metrics ═══
      let totalRevenue = 0;
      txData.forEach(t => {
        const amt = Number(t.total);
        if (amt < 0) totalRevenue += amt;
        else if (t.status === 'completed') totalRevenue += amt;
      });
      let lmRevenue = 0;
      lmTxData.forEach(t => {
        const amt = Number(t.total);
        if (amt < 0) lmRevenue += amt;
        else if (t.status === 'completed') lmRevenue += amt;
      });
      const revenueGrowth = lmRevenue > 0 ? ((totalRevenue - lmRevenue) / lmRevenue) * 100 : 0;
      const avgDailyRev = todayDay > 0 ? totalRevenue / todayDay : 0;
      const projectedMonthly = avgDailyRev * daysInMonth;
      const txCount = txData.length;
      const avgTicket = txCount > 0 ? totalRevenue / txCount : 0;

      // Daily revenue map for heatmap
      const dailyMap = {};
      txData.forEach(tx => {
        const amt = Number(tx.total);
        if (amt >= 0 && tx.status !== 'completed') return; // ignore positive non-completed
        const day = new Date(tx.created_at).getDate();
        dailyMap[day] = (dailyMap[day] || 0) + amt;
      });
      const heatmapData = Array.from({ length: daysInMonth }, (_, i) => ({
        day: i + 1,
        revenue: dailyMap[i + 1] || 0
      }));
      setHeatmap(heatmapData);

      // Best / worst days
      const revDays = Object.entries(dailyMap).map(([d, r]) => ({ day: Number(d), revenue: r }));
      revDays.sort((a, b) => b.revenue - a.revenue);
      const bestDay = revDays[0];
      const worstDay = revDays.length > 1 ? revDays[revDays.length - 1] : null;

      // Yesterday revenue
      const yesterdayRev = dailyMap[yesterday.getDate()] || 0;

      // COGS + FC%
      const productCostMap = {};
      products.forEach(p => { productCostMap[p.id] = Number(p.cost || 0); });
      let totalCOGS = 0;
      const productSalesMap = {};
      txItems.forEach(item => {
        const pid = item.product_id;
        const qty = Number(item.quantity);
        const cost = productCostMap[pid] || 0;
        totalCOGS += qty * cost;
        if (!productSalesMap[pid]) productSalesMap[pid] = { name: item.product_name, qty: 0, revenue: 0, cost };
        productSalesMap[pid].qty += qty;
        productSalesMap[pid].revenue += Number(item.total_price);
      });
      const fcPct = totalRevenue > 0 ? (totalCOGS / totalRevenue) * 100 : 0;
      const grossProfit = totalRevenue - totalCOGS;

      // Top / Bottom sellers
      const productList = Object.entries(productSalesMap).map(([id, d]) => ({ id, ...d, margin: d.revenue - d.qty * d.cost }));
      productList.sort((a, b) => b.qty - a.qty);
      setTopSellers(productList.slice(0, 5));
      const bottom = productList.filter(p => p.qty > 0).sort((a, b) => a.qty - b.qty).slice(0, 3);
      setBottomSellers(bottom);

      // Products with NO sales
      const soldIds = new Set(Object.keys(productSalesMap));
      const noSalesProducts = products.filter(p => !soldIds.has(p.id));

      // Products with no BOM
      const bomProductIds = new Set(bomData.map(b => b.menu_item_id));
      const noBomProducts = products.filter(p => !bomProductIds.has(p.id));

      // High FC products
      const highFcProducts = productList.filter(p => p.cost > 0 && p.revenue > 0 && (p.cost * p.qty / p.revenue) * 100 > 35);

      // Expenses
      const totalExpenses = expenses.filter(e => e.status !== 'cancelled' && e.status !== 'rejected').reduce((s, e) => s + Number(e.amount), 0);
      const rawMatExpenses = expenses.filter(e => e.category === 'วัตถุดิบ' || e.category === 'raw_material').reduce((s, e) => s + Number(e.amount), 0);

      // Fixed costs — ดึงจาก expenses ที่หมวดหมู่เป็น is_fixed_cost = true
      const fixedCostExpenses = expenses.filter(e => 
        (e.status !== 'cancelled' && e.status !== 'rejected') && fixedCostCatNames.includes(e.category)
      );
      const laborCost = fixedCostExpenses.filter(f => /เงินเดือน|ค่าแรง|labor|salary/i.test(f.category)).reduce((s, f) => s + Number(f.amount), 0);
      const rentCost = fixedCostExpenses.filter(f => /ค่าเช่า|rent/i.test(f.category)).reduce((s, f) => s + Number(f.amount), 0);
      const utilCost = fixedCostExpenses.filter(f => /น้ำ|ไฟ|utility|utilities/i.test(f.category)).reduce((s, f) => s + Number(f.amount), 0);
      const totalFixed = fixedCostExpenses.reduce((s, f) => s + Number(f.amount), 0);
      const netProfit = grossProfit - totalFixed;

      // Inventory alerts
      const lowStock = invItems.filter(i => Number(i.current_stock) > 0 && Number(i.current_stock) <= Number(i.reorder_point || 0));
      const outOfStock = invItems.filter(i => Number(i.current_stock) <= 0);
      const overstocked = invItems.filter(i => Number(i.par_level) > 0 && Number(i.current_stock) > Number(i.par_level) * 2);
      setLowStockItems(lowStock);

      // Dead stock value
      const deadStockValue = outOfStock.reduce((s, i) => s + Number(i.cost_per_stock_unit || 0) * Math.abs(Number(i.current_stock || 0)), 0);

      // ═══ Rings ═══
      // Sales target: use system config or 200k default
      let dailySalesTarget = 50000;
      try {
        const conf = JSON.parse(localStorage.getItem('systemConfig') || '{}');
        dailySalesTarget = Number(conf.dailySalesTarget) || 50000;
      } catch {}
      const monthlyTarget = dailySalesTarget * daysInMonth;
      const salesTargetPct = monthlyTarget > 0 ? Math.min(Math.round((totalRevenue / monthlyTarget) * 100), 100) : 0;

      const fcScore = fcPct > 0 && fcPct <= 35 ? 100 : fcPct > 35 ? Math.max(0, 100 - (fcPct - 35) * 5) : (totalRevenue > 0 ? 50 : 0);
      const fcRingPct = Math.min(Math.round(fcPct), 100);

      // Compliance: data completeness
      const hasProducts = products.length > 0;
      const hasTransactions = txData.length > 0;
      const hasBOM = bomData.length > 0;
      const hasFixedCosts = fixedCostExpenses.length > 0;
      const hasInventory = invItems.length > 0;
      const complianceScore = Math.round(
        (hasProducts ? 20 : 0) + (hasTransactions ? 20 : 0) + (hasBOM ? 20 : 0) + (hasFixedCosts ? 20 : 0) + (hasInventory ? 20 : 0)
      );

      setRings({ salesTarget: salesTargetPct, fc: fcRingPct, compliance: complianceScore });

      // Health Score
      const health = Math.round(salesTargetPct * 0.35 + fcScore * 0.30 + complianceScore * 0.20 + (netProfit >= 0 ? 15 : 0));
      setHealthScore(Math.min(health, 100));

      // ═══ Rule Engine — Behavioral Insights ═══
      const rules = [];
      let id = 1;

      // — Revenue insights —
      if (totalRevenue === 0) {
        rules.push({ id: id++, icon: <AlertTriangle size={15} />, type: 'warning', title: 'ไม่มียอดขาย', text: 'ยังไม่มีข้อมูลยอดขายเดือนนี้ — กรุณาตรวจสอบ POS หรือเปิดกะการขาย' });
      } else {
        rules.push({ id: id++, icon: <DollarSign size={15} />, type: 'success', title: `ยอดขาย MTD: ฿${fmtB(totalRevenue)}`, text: `${todayDay} วันแรกของเดือน — เฉลี่ย ฿${fmtB(avgDailyRev)}/วัน | คาดการณ์ถึงสิ้นเดือน ≈ ฿${fmtB(projectedMonthly)}`, metric: { value: `${txCount}`, label: 'รายการ' } });
      }

      if (lmRevenue > 0) {
        if (revenueGrowth > 10) {
          rules.push({ id: id++, icon: <TrendingUp size={15} />, type: 'success', title: 'Growth vs เดือนก่อน', text: `ยอดขายเพิ่มขึ้น ${revenueGrowth.toFixed(1)}% เทียบ ${todayDay} วันแรกของเดือนก่อน 🎉`, metric: { value: `+${revenueGrowth.toFixed(0)}%`, label: 'Growth' } });
        } else if (revenueGrowth < -10) {
          rules.push({ id: id++, icon: <TrendingDown size={15} />, type: 'danger', title: 'ยอดขายลดลง!', text: `ลดลง ${Math.abs(revenueGrowth).toFixed(1)}% เทียบช่วงเดียวกันเดือนก่อน — ควรเพิ่มโปรโมชันหรือกิจกรรมกระตุ้นยอดขาย`, metric: { value: `${revenueGrowth.toFixed(0)}%`, label: 'vs LM' } });
        }
      }

      if (bestDay && bestDay.revenue > avgDailyRev * 1.5) {
        rules.push({ id: id++, icon: <Zap size={15} />, type: 'info', title: `วันขายดีสุด: วันที่ ${bestDay.day}`, text: `ทำรายได้ ฿${fmtB(bestDay.revenue)} — สูงกว่าค่าเฉลี่ย ${Math.round((bestDay.revenue / avgDailyRev - 1) * 100)}% ลองวิเคราะห์สาเหตุ (โปรโมชัน? วันหยุด? สภาพอากาศ?)` });
      }

      if (avgTicket > 0) {
        rules.push({ id: id++, icon: <ShoppingCart size={15} />, type: 'info', title: 'ยอดเฉลี่ยต่อบิล', text: `฿${fmtB(avgTicket)}/บิล — ${avgTicket < 100 ? 'ค่อนข้างต่ำ ลอง Upsell ด้วย Set Menu หรือของเพิ่ม' : 'อยู่ในเกณฑ์ดี'}`, metric: { value: `฿${fmtB(avgTicket)}`, label: 'Avg Ticket' } });
      }

      // — Food Cost —
      if (totalRevenue > 0) {
        if (fcPct > 40) {
          rules.push({ id: id++, icon: <AlertTriangle size={15} />, type: 'danger', title: `🔴 FC% = ${fcPct.toFixed(1)}% (สูงอันตราย!)`, text: `เกินเพดาน 35% อย่างมาก — ตรวจสอบเมนูที่มี FC สูง แก้ไขเร่งด่วนในหน้า Menu Pricing`, metric: { value: `${fcPct.toFixed(1)}%`, label: 'FC%' } });
        } else if (fcPct > 35) {
          rules.push({ id: id++, icon: <BellRing size={15} />, type: 'warning', title: `⚠️ FC% = ${fcPct.toFixed(1)}% (สูงเกินเป้า)`, text: `เป้าหมาย 28-35% — พิจารณาปรับราคาหรือลดต้นทุนในเมนูที่ FC สูง` });
        } else if (fcPct >= 20) {
          rules.push({ id: id++, icon: <CheckCircle size={15} />, type: 'success', title: `✅ FC% = ${fcPct.toFixed(1)}%`, text: `อยู่ในเกณฑ์ดี (Target 28-35%) — รักษาระดับนี้` });
        }
      }

      // — Labor cost —
      if (laborCost > 0 && totalRevenue > 0) {
        const laborPct = (laborCost / totalRevenue) * 100;
        if (laborPct > 30) {
          rules.push({ id: id++, icon: <Users size={15} />, type: 'warning', title: 'ค่าแรงสูง', text: `ค่าแรงคิดเป็น ${laborPct.toFixed(1)}% ของรายได้ (เป้า 20-30%) — พิจารณาปรับกะ/ชั่วโมงทำงาน`, metric: { value: `${laborPct.toFixed(0)}%`, label: 'Labor%' } });
        }
      }

      // — Net Profit —
      if (totalRevenue > 0) {
        const netPct = (netProfit / totalRevenue) * 100;
        if (netProfit < 0) {
          rules.push({ id: id++, icon: <AlertTriangle size={15} />, type: 'danger', title: '❌ ขาดทุนสุทธิ!', text: `ผลขาดทุน ฿${fmtB(Math.abs(netProfit))} (${netPct.toFixed(1)}%) — ต้องลดต้นทุนหรือเพิ่มยอดขายเร่งด่วน`, metric: { value: `฿${fmtB(netProfit)}`, label: 'Net' } });
        } else if (netPct < 10) {
          rules.push({ id: id++, icon: <Target size={15} />, type: 'warning', title: 'กำไรสุทธิต่ำ', text: `Net Profit ${netPct.toFixed(1)}% — ร้านอาหารทั่วไปควรมีกำไรสุทธิ 10-15%` });
        }
      }

      // — Inventory Alerts —
      if (lowStock.length > 0) {
        rules.push({ id: id++, icon: <Package size={15} />, type: 'warning', title: `⚠️ วัตถุดิบใกล้หมด ${lowStock.length} รายการ`, text: lowStock.slice(0, 3).map(i => `${i.name} (เหลือ ${Number(i.current_stock).toFixed(0)})`).join(', ') + (lowStock.length > 3 ? ` ...และอีก ${lowStock.length - 3} รายการ` : ''), metric: { value: `${lowStock.length}`, label: 'Low Stock' } });
      }
      if (outOfStock.length > 0) {
        rules.push({ id: id++, icon: <AlertCircle size={15} />, type: 'danger', title: `🚫 หมดสต๊อก ${outOfStock.length} รายการ`, text: outOfStock.slice(0, 3).map(i => i.name).join(', ') + (outOfStock.length > 3 ? ` ...อีก ${outOfStock.length - 3} รายการ` : '') + ' — สั่งซื้อด่วน!' });
      }
      if (overstocked.length > 0) {
        rules.push({ id: id++, icon: <Lightbulb size={15} />, type: 'tip', title: `สต๊อกเกิน Par Level ${overstocked.length} รายการ`, text: `${overstocked.slice(0, 2).map(i => i.name).join(', ')} — พิจารณาลดปริมาณสั่งซื้อในรอบถัดไป` });
      }

      // — High FC menu items —
      if (highFcProducts.length > 0) {
        rules.push({ id: id++, icon: <BarChart2 size={15} />, type: 'warning', title: `เมนู FC สูงเกิน 35%: ${highFcProducts.length} เมนู`, text: highFcProducts.slice(0, 3).map(p => p.name).join(', ') + ' — ไปหน้า Menu Pricing เพื่อปรับราคา' });
      }

      // — No BOM —
      if (noBomProducts.length > 0 && noBomProducts.length <= 10) {
        rules.push({ id: id++, icon: <Lightbulb size={15} />, type: 'tip', title: `เมนูไม่มีสูตรอาหาร (BOM): ${noBomProducts.length} เมนู`, text: `${noBomProducts.slice(0, 3).map(p => p.name).join(', ')} — ตั้งค่าสูตรอาหารเพื่อให้ COGS คำนวณถูกต้อง` });
      } else if (noBomProducts.length > 10) {
        rules.push({ id: id++, icon: <Lightbulb size={15} />, type: 'tip', title: `เมนูไม่มี BOM: ${noBomProducts.length}/${products.length}`, text: 'เมนูส่วนใหญ่ยังไม่มีสูตรอาหาร — ตั้งค่าในหน้า "สูตรอาหาร (BOM)" เพื่อคำนวณต้นทุนที่แม่นยำ' });
      }

      // — Compliance —
      if (!hasFixedCosts) {
        rules.push({ id: id++, icon: <Lightbulb size={15} />, type: 'info', title: 'ยังไม่มีข้อมูลค่าใช้จ่ายคงที่', text: `ตั้งค่าหมวดหมู่เป็น "ต้นทุนคงที่" ที่หน้า Settings → หมวดหมู่รายจ่าย แล้วบันทึกค่าใช้จ่ายผ่านหน้า M3B ระบบจะคำนวณ Net Profit ให้อัตโนมัติ` });
      }

      // — No sales products —
      if (noSalesProducts.length > 0 && totalRevenue > 0) {
        rules.push({ id: id++, icon: <Lightbulb size={15} />, type: 'tip', title: `${noSalesProducts.length} เมนูไม่มียอดขายเดือนนี้`, text: 'เมนูเหล่านี้ถูกจัดเป็น "Dog" ใน Menu Engineering — พิจารณาตัดออกหรือปรับสูตร' });
      }

      // — Gamification / Motivational —
      if (salesTargetPct >= 100) {
        rules.push({ id: id++, icon: <Award size={15} />, type: 'success', title: '🏆 ถึงเป้ายอดขายแล้ว!', text: 'ยอดขายเกินเป้าหมายที่ตั้งไว้ — ทีมงานทำได้ดีมาก!' });
      } else if (salesTargetPct >= 80) {
        rules.push({ id: id++, icon: <Target size={15} />, type: 'info', title: 'ใกล้ถึงเป้าแล้ว!', text: `ยอดขายอยู่ที่ ${salesTargetPct}% ของเป้า — เหลืออีก ฿${fmtB(monthlyTarget - totalRevenue)} เพื่อถึงเป้า` });
      }

      setInsights(rules);

    } catch (err) {
      console.error('SmartInsights error:', err);
      setInsights([{ id: 99, icon: <AlertTriangle size={15} />, type: 'danger', title: 'Error', text: `โหลดข้อมูลไม่สำเร็จ: ${err.message}` }]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Smart Insights Dashboard</h3>
          <p className="text-sm text-muted">M12: ภาพรวมสุขภาพร้าน — Rule-Engine แนะนำอัจฉริยะ</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <input
            type="month"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="input"
            style={{ fontSize: '13px', padding: '6px 12px', minWidth: '160px' }}
          />
          <button className="btn btn-sm btn-ghost" onClick={() => loadData(true)} disabled={refreshing || loading}>
            <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} /> รีเฟรช
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {[1, 2, 3].map(i => <div key={i} style={{ height: '120px', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', animation: 'pulse 2s infinite cubic-bezier(0.4,0,0.6,1)' }} />)}
        </div>
      ) : (
        <>
          {/* Score + Rings Row */}
          <div className="card" style={{ padding: '28px 32px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-around', flexWrap: 'wrap', gap: '24px' }}>
            <div style={{ textAlign: 'center' }}>
              <HealthRing score={healthScore} />
              <div style={{ marginTop: '12px' }}>
                <div style={{ fontSize: '15px', fontWeight: 700 }}>Health Score</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>คะแนนสุขภาพร้านโดยรวม</div>
              </div>
            </div>
            <div style={{ width: '1px', height: '100px', background: 'var(--border-primary)' }} />
            <MiniRing progress={rings.salesTarget} color="var(--accent-info)" title="Sales Target" subtitle="ยอดขายเทียบเป้า" />
            <MiniRing progress={rings.fc} color={rings.fc > 35 ? 'var(--accent-danger)' : 'var(--accent-success)'} title="Food Cost %" subtitle={rings.fc > 35 ? 'เกินเพดาน!' : 'ต่ำกว่า 35%'} />
            <MiniRing progress={rings.compliance} color="var(--accent-purple)" title="Data Completeness" subtitle="ความสมบูรณ์ของข้อมูล" />
          </div>

          {/* 2-Column: Visual + Insights */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '24px', alignItems: 'start' }}>

            {/* Left Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

              {/* Heatmap */}
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <h4 style={{ fontSize: '14px', fontWeight: 700 }}>ยอดขายรายวัน (Revenue Heatmap)</h4>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>สีเข้ม = ยอดขายสูง | 🔥 = วันขายดีสุด</p>
                  </div>
                  <Calendar size={16} style={{ color: 'var(--text-muted)' }} />
                </div>
                <HeatmapGrid data={heatmap} dayLabels={['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']} />
                <div style={{ display: 'flex', gap: '16px', marginTop: '12px', justifyContent: 'flex-end' }}>
                  {[0.06, 0.3, 0.65, 1].map((a, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--text-muted)' }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: `rgba(16,185,129,${a})`, border: '1px solid var(--border-primary)' }} />
                      {['ไม่มี', 'ต่ำ', 'ปานกลาง', 'สูง'][i]}
                    </div>
                  ))}
                </div>
              </div>

              {/* Top & Bottom Sellers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                {/* Top Sellers */}
                <div className="card">
                  <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    🏆 เมนูขายดี (Top 5)
                  </h4>
                  {topSellers.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>ยังไม่มีข้อมูล</div>
                  ) : topSellers.map((item, i) => (
                    <div key={item.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 0', borderBottom: i < topSellers.length - 1 ? '1px solid var(--border-primary)' : 'none'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          width: '22px', height: '22px', borderRadius: '50%',
                          background: i === 0 ? 'var(--accent-success)' : i === 1 ? 'var(--accent-info)' : 'var(--bg-tertiary)',
                          color: i <= 1 ? 'white' : 'var(--text-muted)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '11px', fontWeight: 700
                        }}>{i + 1}</span>
                        <span style={{ fontSize: '13px', fontWeight: 600 }}>{item.name}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700 }}>{item.qty} จาน</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>฿{fmtB(item.revenue)}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Inventory Alerts */}
                <div className="card">
                  <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    📦 สต๊อกวัตถุดิบต่ำ
                  </h4>
                  {lowStockItems.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px' }}>
                      <CheckCircle size={24} style={{ color: 'var(--accent-success)', marginBottom: '8px' }} />
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>สต๊อกทุกรายการอยู่ในเกณฑ์ปกติ</div>
                    </div>
                  ) : lowStockItems.slice(0, 5).map((item, i) => {
                    const pct = Number(item.reorder_point) > 0 ? (Number(item.current_stock) / Number(item.reorder_point)) * 100 : 0;
                    return (
                      <div key={item.id} style={{
                        padding: '8px 0', borderBottom: i < Math.min(lowStockItems.length, 5) - 1 ? '1px solid var(--border-primary)' : 'none'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 600 }}>{item.name}</span>
                          <span style={{ color: pct < 50 ? 'var(--accent-danger)' : 'var(--accent-warning)', fontWeight: 700 }}>
                            {Number(item.current_stock).toFixed(0)}
                          </span>
                        </div>
                        <div style={{ height: '4px', background: 'var(--bg-secondary)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: pct < 50 ? 'var(--accent-danger)' : 'var(--accent-warning)', borderRadius: '2px', transition: 'width 0.5s' }} />
                        </div>
                      </div>
                    );
                  })}
                  {lowStockItems.length > 5 && (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'center' }}>...อีก {lowStockItems.length - 5} รายการ</div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Insights Feed */}
            <div className="card" style={{ position: 'sticky', top: '20px' }}>
              <div style={{ borderBottom: '1px solid var(--border-primary)', paddingBottom: '14px', marginBottom: '14px' }}>
                <h4 style={{ fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Lightbulb size={17} style={{ color: 'var(--accent-warning)' }} />
                  AI Insights ({insights.length})
                </h4>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>คำแนะนำจาก Rule-Engine วิเคราะห์ข้อมูลร้านอัตโนมัติ</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '680px', overflowY: 'auto' }}>
                {insights.map(i => (
                  <InsightCard key={i.id} icon={i.icon} type={i.type} title={i.title} text={i.text} metric={i.metric} />
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
    </div>
  );
}
